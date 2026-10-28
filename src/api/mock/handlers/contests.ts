/* 대회 · 카테고리 · 북마크 목업 (docs/api/06-contests.md) */
import { fail, paginate, route, validationFail } from '../server';
import { ME_STUDENT_ID, TEACHER_KIM, TEACHER_PARK, currentUser, isTeacherRole, isoKST, users } from '../db';
import type { FieldError } from '../../client';
import type { ContestScope } from '../../types';

/* ---------- 날짜 도우미 (한국 시간) ---------- */
export const todayKST = () => isoKST().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
/* 오늘 + offset일의 한국 날짜 'YYYY-MM-DD' */
export function dateKST(offset: number) {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const at = (date: string, hh: number, mm = 0) => `${date}T${pad(hh)}:${pad(mm)}:00+09:00`;
export const dayDiff = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* 2학기 기말고사: 올해 12/8~12/11 (이미 지났으면 내년) — 추천 핸들러와 학사 일정이 함께 사용 */
const thisYear = Number(todayKST().slice(0, 4));
export const EXAM_YEAR = todayKST() > `${thisYear}-12-11` ? thisYear + 1 : thisYear;
export const FINAL_EXAM = { start: `${EXAM_YEAR}-12-08`, end: `${EXAM_YEAR}-12-11` };

/* ---------- 카테고리 ---------- */
export interface MockCategory { categoryId: number; name: string; normalizedName: string; isDefault: boolean; order: number; }
const normalize = (s: string) => s.replace(/\s+/g, '').toLowerCase();
export const categories: MockCategory[] = [
  { categoryId: 1, name: '공모전', normalizedName: '공모전', isDefault: true, order: 1 },
  { categoryId: 2, name: '경진대회', normalizedName: '경진대회', isDefault: true, order: 2 },
  { categoryId: 3, name: '해커톤', normalizedName: '해커톤', isDefault: true, order: 3 },
  { categoryId: 9, name: '아이디어톤', normalizedName: '아이디어톤', isDefault: false, order: 0 },
];
let nextCategoryId = 10;
const sortedCategories = () => [
  ...categories.filter((c) => c.isDefault).sort((a, b) => a.order - b.order),
  ...categories.filter((c) => !c.isDefault).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
];
const categoryOut = (c: MockCategory) => ({ categoryId: c.categoryId, name: c.name, isDefault: c.isDefault });

/* ---------- 분야 태그 (ContestTags) ---------- */
export const tags: { tagId: number; tagName: string }[] = ['백엔드', '프론트엔드', 'AI', '앱', '임베디드', 'IoT', '알고리즘', '디자인', '기획', '보안', '오픈소스']
  .map((tagName, i) => ({ tagId: i + 1, tagName }));
const tagId = (name: string) => tags.find((t) => t.tagName === name)!.tagId;

/* ---------- 대회 ---------- */
export interface MockContest {
  contestId: number; contestName: string; content: string; scope: ContestScope; categoryId: number;
  tagIds: number[]; startAt: string; finishAt: string; authorId: string; createdAt: string;
  // 추천용 내부 정보 (Contests.expected_score, difficulty, prep_hours, is_verified)
  expectedScore: number; difficulty: number; prepHours: number; isVerified: boolean;
}
export const contests: MockContest[] = [];
let nextContestId = 1;
const C = (c: Omit<MockContest, 'contestId' | 'createdAt' | 'tagIds'> & { tags: string[] }) => {
  const { tags: names, ...rest } = c;
  contests.push({ ...rest, tagIds: names.map(tagId), contestId: nextContestId++, createdAt: isoKST() });
};

C({ contestName: '부산 SW 해커톤', scope: 'OUT_SCHOOL', categoryId: 3, tags: ['백엔드', 'AI'], startAt: at(dateKST(16), 9), finishAt: at(dateKST(17), 18), authorId: TEACHER_KIM,
  content: '부산광역시와 지역 IT 기업이 함께 여는 무박 2일 해커톤입니다.\n\n· 참가 대상: 부산 지역 고등학생 3~4인 팀\n· 주제: 지역 문제를 해결하는 서비스\n· 시상: 대상 1팀, 최우수 2팀, 우수 3팀\n\n교외 수상 시 전공직무능력 \'대회 수상\' 항목으로 인정됩니다.',
  expectedScore: 30, difficulty: 3, prepHours: 20, isVerified: true });
C({ contestName: '교내 알고리즘 경진대회', scope: 'IN_SCHOOL', categoryId: 2, tags: ['알고리즘'], startAt: at(dateKST(10), 14), finishAt: at(dateKST(10), 17), authorId: TEACHER_KIM,
  content: '방과후 3시간 동안 진행하는 개인전 알고리즘 대회입니다. 언어는 C, C++, Java, Python 중 선택합니다.\n\n장소: 본관 3층 실습실',
  expectedScore: 20, difficulty: 2, prepHours: 10, isVerified: true });
C({ contestName: '전국 고교 SW 개발대회', scope: 'OUT_SCHOOL', categoryId: 2, tags: ['백엔드', '프론트엔드'], startAt: at(dateKST(5), 9), finishAt: at(dateKST(60), 18), authorId: TEACHER_PARK,
  content: '예선(서류·영상 심사)과 본선(발표)으로 진행하는 전국 단위 개발대회입니다. 완성도 높은 서비스와 발표 자료가 필요합니다.',
  expectedScore: 60, difficulty: 4, prepHours: 80, isVerified: true });
C({ contestName: '부산 청소년 AI 아이디어톤', scope: 'OUT_SCHOOL', categoryId: 9, tags: ['AI', '기획'], startAt: at(addDays(FINAL_EXAM.start, -3), 10), finishAt: at(addDays(FINAL_EXAM.start, -2), 17), authorId: TEACHER_KIM,
  content: 'AI를 활용한 사회 문제 해결 아이디어를 기획서와 발표로 겨루는 아이디어톤입니다. 개발 구현은 필수가 아닙니다.',
  expectedScore: 25, difficulty: 2, prepHours: 12, isVerified: true });
C({ contestName: '교내 UI/UX 디자인 공모전', scope: 'IN_SCHOOL', categoryId: 1, tags: ['프론트엔드', '디자인'], startAt: at(dateKST(1), 9), finishAt: at(dateKST(25), 18), authorId: TEACHER_KIM,
  content: '학교 생활을 편하게 만드는 앱·웹 화면을 디자인해 제출합니다. Figma 링크 또는 PDF로 제출하세요.',
  expectedScore: 15, difficulty: 1, prepHours: 8, isVerified: true });
C({ contestName: '임베디드 IoT 챌린지', scope: 'OUT_SCHOOL', categoryId: 2, tags: ['임베디드', 'IoT'], startAt: at(dateKST(30), 9), finishAt: at(dateKST(70), 18), authorId: TEACHER_PARK,
  content: '아두이노·라즈베리파이를 활용한 IoT 작품 경진대회입니다. (검수 중: 인정 점수 확인 전)',
  expectedScore: 50, difficulty: 5, prepHours: 100, isVerified: false });
C({ contestName: '정보보안 경진대회', scope: 'OUT_SCHOOL', categoryId: 2, tags: ['보안'], startAt: at(dateKST(28), 10), finishAt: at(dateKST(29), 18), authorId: TEACHER_KIM,
  content: 'CTF 방식 정보보안 경진대회입니다. 웹·리버싱·포렌식 문제가 출제됩니다.',
  expectedScore: 40, difficulty: 4, prepHours: 40, isVerified: true });
C({ contestName: '교내 앱 개발 해커톤', scope: 'IN_SCHOOL', categoryId: 3, tags: ['앱'], startAt: at(dateKST(-21), 9), finishAt: at(dateKST(-20), 18), authorId: TEACHER_KIM,
  content: '1박 2일 교내 앱 개발 해커톤 (종료).',
  expectedScore: 20, difficulty: 3, prepHours: 16, isVerified: true });
C({ contestName: '공개SW 개발자대회', scope: 'OUT_SCHOOL', categoryId: 1, tags: ['오픈소스', '백엔드'], startAt: at(dateKST(-60), 9), finishAt: at(dateKST(-5), 18), authorId: TEACHER_PARK,
  content: '공개 소프트웨어 개발 공모전 (접수 마감).',
  expectedScore: 45, difficulty: 4, prepHours: 60, isVerified: true });

export const findContest = (id: string | number) => contests.find((c) => c.contestId === Number(id)) ?? null;
export const contestTags = (c: MockContest) => c.tagIds.map((id) => tags.find((t) => t.tagId === id)?.tagName).filter((x): x is string => !!x);
export const contestDDay = (c: MockContest) => dayDiff(todayKST(), c.finishAt);

/* ---------- 북마크 (studentId → contestId 집합) ---------- */
const bookmarks = new Map<string, Set<number>>();
const myBookmarks = (studentId: string) => {
  let s = bookmarks.get(studentId);
  if (!s) bookmarks.set(studentId, (s = new Set()));
  return s;
};

/* ---------- 응답 변환 ---------- */
function itemOut(c: MockContest) {
  const me = currentUser();
  const cat = categories.find((x) => x.categoryId === c.categoryId);
  return {
    contestId: c.contestId, contestName: c.contestName, scope: c.scope,
    category: { categoryId: c.categoryId, name: cat?.name ?? '' },
    tags: contestTags(c), startAt: c.startAt, finishAt: c.finishAt, dDay: contestDDay(c),
    isBookmarked: me.role === 'STUDENT' && myBookmarks(me.userId).has(c.contestId),
  };
}
function detailOut(c: MockContest) {
  const author = users.find((u) => u.userId === c.authorId);
  return { ...itemOut(c), content: c.content, author: { userId: c.authorId, name: author?.name ?? '알 수 없음' } };
}
/* 마감이 가까운 순, 종료된 대회는 뒤로 (종료된 것끼리는 최근 종료 순) */
function sortContests(xs: MockContest[]) {
  const now = isoKST();
  return [...xs].sort((a, b) => {
    const ae = a.finishAt < now, be = b.finishAt < now;
    if (ae !== be) return ae ? 1 : -1;
    return ae ? b.finishAt.localeCompare(a.finishAt) : a.finishAt.localeCompare(b.finishAt);
  });
}

const requireTeacher = () => {
  const me = currentUser();
  if (!isTeacherRole(me)) fail(403, 'FORBIDDEN', '교사만 사용할 수 있습니다.');
  return me;
};
const requireStudent = () => {
  const me = currentUser();
  if (me.role !== 'STUDENT') fail(403, 'FORBIDDEN', '학생만 사용할 수 있습니다.');
  return me;
};
const requireContest = (id: string) => findContest(id) ?? fail(404, 'CONTEST_NOT_FOUND', '대회를 찾을 수 없습니다.');

/* ---------- 카테고리 API ---------- */
route('GET', '/api/contest-categories', () => ({ items: sortedCategories().map(categoryOut) }));

const CATEGORY_RE = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 •·&()]+$/;
route('POST', '/api/contest-categories', ({ body }) => {
  requireTeacher();
  const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ');
  const err = (reason: string, message: string) => validationFail([{ field: 'name', reason, message }]);
  if (!name) err('EMPTY', '카테고리 이름을 입력하세요.');
  if (name.length > 20) err('TOO_LONG', '카테고리 이름은 20자 이하로 입력하세요.');
  if (!CATEGORY_RE.test(name)) err('INVALID_CHARACTER', '한글·영문·숫자·공백과 • · & ( )만 쓸 수 있습니다.');
  const normalizedName = normalize(name);
  const exist = categories.find((c) => c.normalizedName === normalizedName);
  if (exist) return { ...categoryOut(exist), created: false }; // 200
  const c: MockCategory = { categoryId: nextCategoryId++, name, normalizedName, isDefault: false, order: 0 };
  categories.push(c);
  return { ...categoryOut(c), created: true }; // 201
});

/* ---------- 대회 API ---------- */
function parseFilters(query: URLSearchParams) {
  const scope = query.get('scope');
  const categoryId = query.get('categoryId');
  const errors: FieldError[] = [];
  if (scope && scope !== 'IN_SCHOOL' && scope !== 'OUT_SCHOOL') errors.push({ field: 'scope', reason: 'INVALID_VALUE', message: '구분 값이 올바르지 않습니다.' });
  if (categoryId && !categories.some((c) => String(c.categoryId) === categoryId)) errors.push({ field: 'categoryId', reason: 'NOT_FOUND', message: '없는 카테고리입니다.' });
  if (errors.length) validationFail(errors);
  return { scope: scope || null, categoryId: categoryId ? Number(categoryId) : null };
}

route('GET', '/api/contests', ({ query }) => {
  const f = parseFilters(query);
  const rows = sortContests(contests.filter((c) => (!f.scope || c.scope === f.scope) && (!f.categoryId || c.categoryId === f.categoryId)));
  const p = paginate(rows, query.get('page'));
  return { ...p, items: p.items.map(itemOut) };
});

route('GET', '/api/contests/:id', ({ params }) => detailOut(requireContest(params.id)));

function validateContest(body: Record<string, unknown> | undefined) {
  const errors: FieldError[] = [];
  const name = typeof body?.contestName === 'string' ? body.contestName.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  const scope = body?.scope;
  const categoryId = body?.categoryId;
  const startAt = typeof body?.startAt === 'string' ? body.startAt : '';
  const finishAt = typeof body?.finishAt === 'string' ? body.finishAt : '';
  if (!name) errors.push({ field: 'contestName', reason: 'EMPTY', message: '대회명을 입력하세요.' });
  else if (name.length > 30) errors.push({ field: 'contestName', reason: 'TOO_LONG', message: '대회명은 30자 이하로 입력하세요.' });
  if (!content) errors.push({ field: 'content', reason: 'EMPTY', message: '대회 안내 본문을 입력하세요.' });
  if (scope !== 'IN_SCHOOL' && scope !== 'OUT_SCHOOL') errors.push({ field: 'scope', reason: 'REQUIRED', message: '교내 또는 교외를 선택하세요.' });
  if (categoryId === null || categoryId === undefined || categoryId === '') errors.push({ field: 'categoryId', reason: 'REQUIRED', message: '카테고리를 선택하세요.' });
  else if (!categories.some((c) => c.categoryId === Number(categoryId))) fail(404, 'CATEGORY_NOT_FOUND', '없는 카테고리입니다.');
  const validDate = (s: string) => !!s && !Number.isNaN(Date.parse(s));
  if (!validDate(startAt)) errors.push({ field: 'startAt', reason: 'REQUIRED', message: '시작 일시를 입력하세요.' });
  if (!validDate(finishAt)) errors.push({ field: 'finishAt', reason: 'REQUIRED', message: '마감 일시를 입력하세요.' });
  else if (validDate(startAt) && Date.parse(startAt) > Date.parse(finishAt)) errors.push({ field: 'finishAt', reason: 'INVALID_RANGE', message: '마감 일시는 시작 일시보다 같거나 늦어야 합니다.' });
  const tagIds = Array.isArray(body?.tagIds) ? (body!.tagIds as unknown[]).map(Number) : undefined;
  if (tagIds?.some((id) => !tags.some((t) => t.tagId === id))) errors.push({ field: 'tagIds', reason: 'NOT_FOUND', message: '없는 분야 태그가 있습니다.' });
  if (errors.length) validationFail(errors);
  return { contestName: name, content, scope: scope as ContestScope, categoryId: Number(categoryId), startAt, finishAt, tagIds };
}

route('POST', '/api/contests', ({ body }) => {
  const me = requireTeacher();
  const v = validateContest(body);
  const c: MockContest = {
    contestId: nextContestId++, contestName: v.contestName, content: v.content, scope: v.scope, categoryId: v.categoryId,
    tagIds: v.tagIds ?? [], startAt: v.startAt, finishAt: v.finishAt, authorId: me.userId, createdAt: isoKST(),
    // 추천 정보는 관리자가 검수 후 입력 (등록 직후에는 추천 대상 아님)
    expectedScore: 0, difficulty: 3, prepHours: 1, isVerified: false,
  };
  contests.push(c);
  return detailOut(c); // 201 + Location
});

const requireEditable = (id: string) => {
  const me = requireTeacher();
  const c = requireContest(id);
  if (me.role !== 'ADMIN' && c.authorId !== me.userId) fail(403, 'FORBIDDEN', '작성한 교사와 관리자만 수정할 수 있습니다.');
  return c;
};

route('PUT', '/api/contests/:id', ({ params, body }) => {
  const c = requireEditable(params.id);
  const v = validateContest(body);
  Object.assign(c, { contestName: v.contestName, content: v.content, scope: v.scope, categoryId: v.categoryId, startAt: v.startAt, finishAt: v.finishAt });
  if (v.tagIds) c.tagIds = v.tagIds; // tagIds를 생략하면 기존 태그 유지 (목업 가정)
  return detailOut(c);
});

route('DELETE', '/api/contests/:id', ({ params }) => {
  const c = requireEditable(params.id);
  contests.splice(contests.indexOf(c), 1);
  bookmarks.forEach((s) => s.delete(c.contestId));
});

/* ---------- 북마크 API ---------- */
route('PUT', '/api/contests/:id/bookmark', ({ params }) => {
  const me = requireStudent();
  const c = requireContest(params.id);
  myBookmarks(me.userId).add(c.contestId);
});
route('DELETE', '/api/contests/:id/bookmark', ({ params }) => {
  const me = requireStudent();
  const c = requireContest(params.id);
  myBookmarks(me.userId).delete(c.contestId);
});
route('GET', '/api/me/bookmarks', ({ query }) => {
  const me = requireStudent();
  const set = myBookmarks(me.userId);
  const p = paginate(sortContests(contests.filter((c) => set.has(c.contestId))), query.get('page'));
  return { ...p, items: p.items.map(itemOut) };
});

/* 시드: 손범수 학생이 부산 SW 해커톤을 북마크해 둠 */
myBookmarks(ME_STUDENT_ID).add(1);
