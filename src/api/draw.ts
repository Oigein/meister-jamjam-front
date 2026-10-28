import { USE_MOCK, mock, post, request } from './client';

export interface DrawStudent { num: number; name: string; }
export interface DrawClass {
  id: string; label: string; students: DrawStudent[];
  excluded: number[];             // 번호
  fixed: Record<number, number>;  // 번호 → 자리 인덱스
  lastSeed: string;
}
export interface DrawResult { seed: string; seats: (number | null)[]; excluded: number[]; fixed: Record<number, number>; }

export const getDrawClasses = (signal?: AbortSignal) =>
  USE_MOCK ? mock(MOCK) : request<DrawClass[]>('/draw/classes', { signal });

/* 섞은 결과를 서버에 남겨두면 나중에 시드로 검증·이력 조회 가능 */
export const saveDrawResult = (classId: string, result: DrawResult) =>
  USE_MOCK ? mock(null) : post<null>(`/draw/classes/${classId}/results`, result);

/* ---------- 목업 ---------- */
const toStudents = (names: string[]) => names.map((name, i) => ({ num: i + 1, name }));

const MOCK: DrawClass[] = [
  {
    id: '2-1', label: '2학년 1반',
    students: toStudents(['강민준', '김서연', '김하은', '박도윤', '박지호', '손범수', '오수아', '윤시우', '배서윤', '이유진', '임채원', '장태윤', '정다은', '조승민', '최소율', '한은호']),
    excluded: [9], fixed: { 1: 0 }, lastSeed: 'DAA5-82A9-0123',
  },
  {
    id: '2-2', label: '2학년 2반',
    students: toStudents(['권도현', '김나윤', '김태민', '남궁현', '문서진', '박건우', '서하늘', '신예린', '안지성', '유하람', '이준혁', '전소민', '정우진', '최다인', '황보람']),
    excluded: [], fixed: {}, lastSeed: '41C0-9E2B-77F1',
  },
];
