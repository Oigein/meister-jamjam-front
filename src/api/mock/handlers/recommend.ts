/* 대회 추천 LLM · 학사 일정 · 추천 가이드라인 목업 (docs/api/08-recommend.md) */
import { fail, route, sleep, stream, validationFail } from '../server';
import { currentUser, findStudent, isoKST, uuid, totalScore } from '../db';
import { SCORE_TYPES, SCORE_TYPE_LABEL, type ScoreType } from '../../types';
import type { FieldError } from '../../client';
import { FINAL_EXAM, EXAM_YEAR, addDays, contestDDay, contestTags, contests, dateKST, dayDiff, findContest, todayKST, type MockContest } from './contests';

/* ---------- 학사 일정 ---------- */
type ScheduleType = 'EXAM' | 'PROJECT' | 'EVENT';
interface Schedule { scheduleId: number; type: ScheduleType; title: string; startDate: string; endDate: string; }
const schedules: Schedule[] = [
  { scheduleId: 1, type: 'EXAM', title: '2학기 중간고사', startDate: `${EXAM_YEAR}-10-13`, endDate: `${EXAM_YEAR}-10-16` },
  { scheduleId: 2, type: 'PROJECT', title: '나르샤 최종 발표', startDate: dateKST(17), endDate: dateKST(18) },
  { scheduleId: 3, type: 'EXAM', title: '2학기 기말고사', startDate: FINAL_EXAM.start, endDate: FINAL_EXAM.end },
  { scheduleId: 4, type: 'EVENT', title: '겨울방학식', startDate: `${EXAM_YEAR}-12-31`, endDate: `${EXAM_YEAR}-12-31` },
];
const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart <= bEnd && bStart <= aEnd;

route('GET', '/api/academic-schedules', ({ query }) => {
  const from = query.get('from') || '0000-01-01';
  const to = query.get('to') || '9999-12-31';
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if ((query.get('from') && !re.test(from)) || (query.get('to') && !re.test(to))) validationFail([{ field: 'from', reason: 'INVALID_DATE', message: '날짜 형식이 올바르지 않습니다.' }]);
  return { items: schedules.filter((s) => overlaps(s.startDate, s.endDate, from, to)).sort((a, b) => a.startDate.localeCompare(b.startDate)) };
});

/* ---------- 가이드라인 (단일 행) ---------- */
const guidelines = {
  promptGuideline: '참가비가 과도한 대회는 추천하지 말 것.\n교내 마역량 인정 규정에 있는 대회만 예상 점수를 안내할 것.\n학생의 가장 약한 영역을 보완할 수 있는 대회를 우선 설명할 것.',
  examBufferDays: 7,
  version: 3,
};
const requireAdmin = () => { if (currentUser().role !== 'ADMIN') fail(403, 'FORBIDDEN', '관리자만 사용할 수 있습니다.'); };

route('GET', '/api/admin/recommendation-guidelines', () => { requireAdmin(); return { ...guidelines }; });
route('PUT', '/api/admin/recommendation-guidelines', ({ body }) => {
  requireAdmin();
  const errors: FieldError[] = [];
  const text = typeof body?.promptGuideline === 'string' ? body.promptGuideline.trim() : '';
  const days = Number(body?.examBufferDays);
  if (!text) errors.push({ field: 'promptGuideline', reason: 'EMPTY', message: '가이드라인을 입력하세요.' });
  else if (text.length > 5000) errors.push({ field: 'promptGuideline', reason: 'TOO_LONG', message: '가이드라인은 5,000자 이하로 입력하세요.' });
  if (!Number.isInteger(days) || days < 0 || days > 30) errors.push({ field: 'examBufferDays', reason: 'OUT_OF_RANGE', message: '시험 전후 제외 일수는 0~30일입니다.' });
  if (errors.length) validationFail(errors);
  if (Number(body?.version) !== guidelines.version) fail(409, 'VERSION_CONFLICT', '다른 관리자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장하세요.');
  Object.assign(guidelines, { promptGuideline: text, examBufferDays: days, version: guidelines.version + 1 });
  return { ...guidelines };
});

/* ---------- 맞춤 대회 추천 ---------- */
const MAJORS = ['BACKEND', 'FRONTEND', 'AI', 'APP', 'EMBEDDED', 'ETC'] as const;
const MAJOR_TAG: Record<string, string> = { BACKEND: '백엔드', FRONTEND: '프론트엔드', AI: 'AI', APP: '앱', EMBEDDED: '임베디드' };
type RecType = 'VALUE' | 'HIGH_SCORE' | 'SHORT_TERM';
const TYPES: RecType[] = ['VALUE', 'HIGH_SCORE', 'SHORT_TERM'];

const requireStudent = () => {
  const me = currentUser();
  if (me.role !== 'STUDENT') fail(403, 'FORBIDDEN', '학생만 사용할 수 있습니다.');
  return findStudent(me.userId)!;
};

/* LLM이 할 분류를 흉내: 짧게 끝나면 단기 완수, 점수가 크면 고득점, 나머지는 가성비 */
const classify = (c: MockContest): RecType => (c.prepHours <= 12 ? 'SHORT_TERM' : c.expectedScore >= 40 ? 'HIGH_SCORE' : 'VALUE');

const TEAM_TIP: Record<number, string | null> = {
  1: '개인 참가로도 충분합니다.',
  2: '2인 팀이면 역할을 나누기 좋습니다.',
  3: '프론트엔드 1명, 디자인 1명과 3인 팀을 권장합니다.',
  4: '백엔드·프론트엔드·기획을 나눈 3~4인 팀을 권장합니다.',
  5: '하드웨어 경험자가 있는 4인 팀을 권장합니다.',
};

route('POST', '/api/contest-recommendations', async ({ body }) => {
  const student = requireStudent();
  const b = (body ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  // 입력 검사
  const errors: FieldError[] = [];
  if (b.major != null && !MAJORS.includes(b.major)) errors.push({ field: 'major', reason: 'INVALID_VALUE', message: '전공 값이 올바르지 않습니다.' });
  const stack: string[] = Array.isArray(b.techStack) ? b.techStack.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
  if (stack.length > 10) errors.push({ field: 'techStack', reason: 'TOO_MANY', message: '기술 스택은 10개까지 입력할 수 있습니다.' });
  if (stack.some((s) => s.length > 30)) errors.push({ field: 'techStack', reason: 'TOO_LONG', message: '기술 스택은 각 30자 이하로 입력하세요.' });
  const target = b.goal?.targetScore;
  if (target != null && (!Number.isInteger(target) || target < 1)) errors.push({ field: 'goal.targetScore', reason: 'OUT_OF_RANGE', message: '목표 점수는 1 이상이어야 합니다.' });
  const desc: string = typeof b.goal?.description === 'string' ? b.goal.description.trim() : '';
  if (desc.length > 100) errors.push({ field: 'goal.description', reason: 'TOO_LONG', message: '목표 설명은 100자 이하로 입력하세요.' });
  if (b.availableUntil != null && !/^\d{4}-\d{2}-\d{2}$/.test(b.availableUntil)) errors.push({ field: 'availableUntil', reason: 'INVALID_DATE', message: '날짜 형식이 올바르지 않습니다.' });
  const types: RecType[] = Array.isArray(b.types) && b.types.length ? b.types : TYPES;
  if (types.some((t) => !TYPES.includes(t))) errors.push({ field: 'types', reason: 'INVALID_VALUE', message: '추천 분류 값이 올바르지 않습니다.' });
  if (errors.length) validationFail(errors);

  await sleep(900); // LLM 응답 대기 흉내
  if (desc.includes('오류')) fail(502, 'UPSTREAM_ERROR', '추천을 만들지 못했습니다. 다시 시도하세요.'); // 목업: 502 확인용

  // 학생 데이터 (서버 주입)
  const weakestArea = SCORE_TYPES.reduce<ScoreType>((w, t) => (student.scores[t] < student.scores[w] ? t : w), SCORE_TYPES[0]);
  const studentContext = { grade: student.grade, totalScore: totalScore(student), weakestArea };

  // RAG 후보: DB에 있고, 마감 전이며, 검수된 대회만
  const today = todayKST();
  const exams = schedules.filter((s) => s.type === 'EXAM');
  const buffer = guidelines.examBufferDays;
  const recs = [];
  for (const c of contests) {
    const finishDate = c.finishAt.slice(0, 10);
    if (finishDate < today || !c.isVerified) continue;
    if (b.availableUntil && finishDate > b.availableUntil) continue;
    const examHits = exams.filter((e) => overlaps(finishDate, finishDate, addDays(e.startDate, -buffer), addDays(e.endDate, buffer)));
    if (examHits.length && !b.includeExamPeriod) continue;
    const projectHits = schedules.filter((s) => s.type !== 'EXAM' && overlaps(c.startAt.slice(0, 10), finishDate, s.startDate, s.endDate));
    const recommendType = classify(c);
    if (!types.includes(recommendType)) continue;
    const tags = contestTags(c);
    const majorTag = b.major ? MAJOR_TAG[b.major] : undefined;
    const stackHit = stack.find((s) => tags.some((t) => t.toLowerCase() === s.toLowerCase()) || c.contestName.toLowerCase().includes(s.toLowerCase()));
    const days = dayDiff(today, c.finishAt);
    const parts: string[] = [];
    if (majorTag && tags.includes(majorTag)) parts.push(`${majorTag} 전공과 분야가 맞고`);
    else if (stackHit) parts.push(`${stackHit} 경험을 살릴 수 있고`);
    if (recommendType === 'SHORT_TERM') parts.push(`준비 ${c.prepHours}시간 정도로 짧게 끝낼 수 있습니다.`);
    else if (recommendType === 'HIGH_SCORE') parts.push(`수상하면 +${c.expectedScore}점으로 점수 폭이 큽니다.`);
    else parts.push(`시간 대비 점수 효율이 좋습니다.`);
    if (target && c.expectedScore >= target) parts.push(`목표 ${target}점을 이 대회 하나로 채울 수 있습니다.`);
    if (weakestArea === 'MAJOR_SKILL') parts.push(`가장 낮은 ${SCORE_TYPE_LABEL[weakestArea]}을 보완합니다.`);
    recs.push({
      contestId: c.contestId, contestName: c.contestName, recommendType, scope: c.scope, tags,
      expectedScore: c.expectedScore, deadline: c.finishAt, dDay: days, difficulty: c.difficulty, prepHours: c.prepHours,
      efficiencyScore: Math.round((c.expectedScore / c.prepHours) * 100) / 100,
      reason: parts.join(' '),
      teamTip: TEAM_TIP[c.difficulty] ?? null,
      scheduleWarnings: [...examHits, ...projectHits].map(({ type, title, startDate, endDate }) => ({ type, title, startDate, endDate })),
    });
  }
  recs.sort((a, b2) => b2.efficiencyScore - a.efficiencyScore);
  return {
    generatedAt: isoKST(),
    studentContext,
    recommendations: recs,
    message: recs.length ? null : '지금 조건에 맞는 대회가 없습니다. 준비 가능 날짜를 늘리거나 시험 기간 포함을 켜 보세요.',
  };
});

/* ---------- 추가 질의응답 (대화는 30분 보관) ---------- */
interface Conversation { id: string; studentId: string; contestId: number | null; turns: { role: 'user' | 'assistant'; text: string }[]; updatedAt: number; }
const conversations = new Map<string, Conversation>();
const TTL = 30 * 60_000;

function prepareChat(body: Record<string, unknown> | undefined) {
  const student = requireStudent();
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) validationFail([{ field: 'message', reason: 'EMPTY', message: '질문을 입력하세요.' }]);
  if (message.length > 1000) validationFail([{ field: 'message', reason: 'TOO_LONG', message: '질문은 1,000자 이하로 입력하세요.' }]);
  const contestId = body?.contestId == null || body.contestId === '' ? null : Number(body.contestId);
  const contest = contestId != null ? findContest(contestId) ?? fail(404, 'CONTEST_NOT_FOUND', '대회를 찾을 수 없습니다.') : null;
  let conv: Conversation | undefined;
  const cid = body?.conversationId;
  if (cid) {
    conv = conversations.get(String(cid));
    if (!conv || conv.studentId !== student.studentId || Date.now() - conv.updatedAt > TTL) {
      fail(404, 'CONVERSATION_NOT_FOUND', '대화가 만료되었습니다. 새 대화로 시작하세요.');
    }
  } else {
    conv = { id: uuid(), studentId: student.studentId, contestId: null, turns: [], updatedAt: Date.now() };
    conversations.set(conv.id, conv);
  }
  if (contest) conv.contestId = contest.contestId;
  const ctxContest = conv.contestId != null ? findContest(conv.contestId) : null;
  conv.turns.push({ role: 'user', text: message });
  const reply = cannedReply(message, ctxContest, conv.turns.length > 1);
  conv.turns.push({ role: 'assistant', text: reply });
  conv.updatedAt = Date.now();
  return { conv, reply };
}

function cannedReply(q: string, c: MockContest | null, continued: boolean) {
  const lines: string[] = [];
  const name = c ? `'${c.contestName}'` : '추천 대회';
  if (continued && !c) lines.push('앞선 대화를 이어서 답변드릴게요.');
  if (c) {
    const d = contestDDay(c);
    lines.push(`${name}은 마감까지 ${d >= 0 ? `${d}일` : '이미 종료된 상태'}이고, 분야는 ${contestTags(c).join('·') || '자유'}입니다. 예상 준비 시간은 약 ${c.prepHours}시간이에요.`);
  }
  if (/아이디어|주제|기획/.test(q)) {
    lines.push('아이디어는 이렇게 좁혀 보세요.', '1) 학교·지역에서 직접 겪은 불편을 3개 적고, 사용자가 누구인지 한 문장으로 정의합니다.', '2) 그중 이틀 안에 핵심 기능 하나를 시연할 수 있는 것을 고릅니다.', '3) 심사 기준(문제 정의, 구현, 발표)에 맞춰 발표 흐름을 먼저 짜고 개발을 시작하면 시간이 덜 듭니다.');
  } else if (/팀|팀원|역할/.test(q)) {
    lines.push('팀은 3인 구성이 무난합니다. 백엔드 1명, 프론트엔드 1명, 기획·디자인 겸 발표 1명으로 나누고, 첫날 API 명세를 먼저 맞춰 두면 병렬 작업이 쉬워집니다.');
  } else if (/시험|일정|기간|언제/.test(q)) {
    lines.push(`2학기 기말고사가 ${FINAL_EXAM.start.slice(5).replace('-', '월 ')}일부터라 마감이 그 전후 1주일이면 공부 시간과 겹칩니다. 시험 2주 전까지 결과물을 거의 끝내 두는 계획을 권합니다.`);
  } else if (/점수|마역량|인정/.test(q)) {
    lines.push(c ? `수상하면 마역량 약 +${c.expectedScore}점(전공직무능력 '대회 수상')으로 인정될 수 있어요. 정확한 인정 여부는 담당 선생님께 증빙을 제출해 확인하세요.` : '대회 수상은 전공직무능력의 \'대회 수상\' 항목으로 인정됩니다. 교내 금상 100점, 교외 장려 60점이 기준이에요.');
  } else {
    lines.push('준비 순서는 ① 요강·심사 기준 확인 → ② 팀·역할 정하기 → ③ 핵심 기능 하나 완성 → ④ 발표 자료 다듬기를 권합니다. 더 궁금한 점을 구체적으로 물어보세요.');
  }
  return lines.join('\n');
}

route('POST', '/api/contest-recommendations/chat', async ({ body }) => {
  const { conv, reply } = prepareChat(body);
  await sleep(600);
  return { conversationId: conv.id, reply, createdAt: isoKST() };
});

stream('POST', '/api/contest-recommendations/chat', async ({ body }, emit) => {
  const { conv, reply } = prepareChat(body);
  for (let i = 0; i < reply.length; i += 6) {
    await sleep(35);
    emit('delta', JSON.stringify({ text: reply.slice(i, i + 6) }));
  }
  emit('done', JSON.stringify({ conversationId: conv.id }));
});
