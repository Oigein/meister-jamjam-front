import { ApiError, USE_MOCK, mock, post, request } from './client';
import { findMockStudent } from './ranking';

export interface ScoreItemOption { id: string; label: string; max: number; }
export interface AiAnalysis { category: string; name: string; issuedAt: string; suggestedItemId: string; expected: number; reason: string; }
export interface Submission {
  id: string;
  student: { id: string; no: string; name: string; total: number; grade: string };
  submittedAt: string; category: string; title: string;
  file: { name: string; size: number; kind: 'pdf' | 'image'; url?: string };
  ai: AiAnalysis | null; // OCR · LLM 분석 결과 (백엔드에서 제출 시 비동기로 채움)
}
export interface GradingData { queue: Submission[]; items: ScoreItemOption[]; }

export const getGradingData = (signal?: AbortSignal) =>
  USE_MOCK ? mock(MOCK) : request<GradingData>('/grading/queue', { signal });

export const approveSubmission = (id: string, body: { itemId: string; points: number }) =>
  USE_MOCK ? mock(null, 300) : post<null>(`/grading/submissions/${id}/approve`, body);

export const rejectSubmission = (id: string, reason: string) =>
  USE_MOCK ? mock(null, 300) : post<null>(`/grading/submissions/${id}/reject`, { reason });

export async function grantScore(body: { studentNo: string; itemId: string; points: number; reason: string }) {
  if (!USE_MOCK) return post<{ studentName: string }>('/grading/grants', body);
  const s = findMockStudent(body.studentNo);
  if (!s) throw new ApiError(404, '해당 학번의 학생을 찾을 수 없습니다.');
  return mock({ studentName: s.name }, 300);
}

/* ---------- 목업 ---------- */
const MOCK: GradingData = {
  items: [
    { id: 'cert-func', label: '자격증 › 국가기술 기능사', max: 100 },
    { id: 'cert-ind', label: '자격증 › 국가기술 산업기사', max: 150 },
    { id: 'cert-priv', label: '자격증 › 민간 자격', max: 50 },
    { id: 'contest-in', label: '대회 › 교내 수상', max: 100 },
    { id: 'contest-out', label: '대회 › 교외 수상', max: 150 },
    { id: 'contest-join', label: '대회 › 참가', max: 20 },
    { id: 'project', label: '프로젝트 › 완료', max: 100 },
    { id: 'volunteer', label: '인성 · 봉사 › 봉사활동', max: 50 },
    { id: 'lang', label: '외국어 › 공인 성적', max: 100 },
  ],
  queue: [
    { id: 's1', student: { id: '2109', no: '2109', name: '손범수', total: 452, grade: 'B+' }, submittedAt: '10:12', category: '자격증', title: '정보처리기능사',
      file: { name: 'certificate.pdf', size: 1_258_291, kind: 'pdf' },
      ai: { category: '자격증', name: '정보처리기능사', issuedAt: '2026-09-18', suggestedItemId: 'cert-func', expected: 100, reason: '자격증명과 발급기관(한국산업인력공단)이 확인되며, 기능사 등급은 기준표상 100점입니다.' } },
    { id: 's2', student: { id: '1203', no: '1203', name: findMockStudent('1203')?.name ?? '김하은', total: findMockStudent('1203')?.total ?? 300, grade: 'C' }, submittedAt: '09:40', category: '대회', title: '부산 SW 해커톤 참가확인서',
      file: { name: 'hackathon.png', size: 842_000, kind: 'image' },
      ai: { category: '대회', name: '부산 SW 해커톤', issuedAt: '2026-10-19', suggestedItemId: 'contest-join', expected: 20, reason: '수상 내역 없이 참가 확인 문구만 있어 참가 항목으로 분류했습니다.' } },
    { id: 's3', student: { id: '3112', no: '3112', name: findMockStudent('3112')?.name ?? '이준서', total: findMockStudent('3112')?.total ?? 480, grade: 'B+' }, submittedAt: '어제', category: '자격증', title: '리눅스마스터 2급',
      file: { name: 'linux2.pdf', size: 655_000, kind: 'pdf' },
      ai: { category: '자격증', name: '리눅스마스터 2급', issuedAt: '2026-10-11', suggestedItemId: 'cert-priv', expected: 50, reason: '한국정보통신진흥협회 발급 민간 자격으로 확인되어 최대 인정 50점입니다.' } },
    { id: 's4', student: { id: '2304', no: '2304', name: findMockStudent('2304')?.name ?? '정다은', total: findMockStudent('2304')?.total ?? 410, grade: 'B' }, submittedAt: '어제', category: '수상', title: '교내 알고리즘 경진대회 은상',
      file: { name: 'award.jpg', size: 1_920_000, kind: 'image' },
      ai: null },
  ],
};
