import { USE_MOCK, mock, post, request } from './client';
import { todayMMDD } from '../lib/format';

export interface Teacher { id: string; name: string; role: string; homeroom?: boolean; }
export type ReportMethod = 'meeting' | 'written' | 'notice';
export type ReportStep = 0 | 1 | 2 | 3;
export interface Report {
  id: string; teacherIds: string[]; teacherNames: string; type: string; title: string; content: string;
  method: ReportMethod; date: string; step: ReportStep; reply?: { teacher: string; text: string };
}
export interface ReportInput { teacherIds: string[]; type: string; title: string; content: string; method: ReportMethod; files: File[]; }
export interface ReportPageData { teachers: Teacher[]; reports: Report[]; }

export const getReportPage = (signal?: AbortSignal) =>
  USE_MOCK ? mock(MOCK) : request<ReportPageData>('/reports/mine', { signal });

export async function submitReport(input: ReportInput): Promise<Report> {
  if (!USE_MOCK) return post<Report>('/reports', toFormData(input));
  return mock(toMockReport(`r${Date.now()}`, input));
}

export async function updateReport(id: string, input: ReportInput): Promise<Report> {
  if (!USE_MOCK) return request<Report>(`/reports/${id}`, { method: 'PUT', body: toFormData(input) });
  return mock(toMockReport(id, input));
}

export const withdrawReport = (id: string) =>
  USE_MOCK ? mock(null) : request<null>(`/reports/${id}`, { method: 'DELETE' });

function toFormData(input: ReportInput) {
  const fd = new FormData();
  const { files, ...rest } = input;
  fd.append('data', new Blob([JSON.stringify(rest)], { type: 'application/json' }));
  files.forEach((f) => fd.append('files', f));
  return fd;
}

/* ---------- 목업 ---------- */
const TEACHERS: Teacher[] = [
  { id: 't1', name: '김지훈 선생님', role: '담임', homeroom: true },
  { id: 't2', name: '박서연 선생님', role: '학생부' },
  { id: 't3', name: '이도현 선생님', role: '기숙사 사감' },
  { id: 't4', name: '상담 선생님', role: 'Wee 클래스' },
];

const MOCK: ReportPageData = {
  teachers: TEACHERS,
  reports: [
    { id: 'r3', teacherIds: ['t1'], teacherNames: '김지훈 선생님', type: '물품 분실 · 습득', title: '실습실 이어폰 습득', content: '3층 실습실에서 무선 이어폰을 주웠습니다.', method: 'notice', date: '10-28', step: 0 },
    { id: 'r2', teacherIds: ['t1'], teacherNames: '김지훈 선생님', type: '교칙 관련', title: '기숙사 소등 관련', content: '소등 시간 관련해서 말씀드리고 싶은 게 있습니다.', method: 'written', date: '10-21', step: 2, reply: { teacher: '김지훈 선생님', text: '말해 줘서 고마워요. 내일 점심시간에 잠깐 이야기해요.' } },
    { id: 'r1', teacherIds: ['t4'], teacherNames: '상담 선생님', type: '기타 고민 상담', title: '수행평가 일정 고민', content: '수행평가가 몰려서 걱정입니다.', method: 'meeting', date: '09-30', step: 3 },
  ],
};

function toMockReport(id: string, input: ReportInput): Report {
  const { files: _files, ...rest } = input;
  return { ...rest, id, date: todayMMDD(), step: 0, teacherNames: input.teacherIds.map((t) => TEACHERS.find((x) => x.id === t)?.name ?? '').join(', ') };
}
