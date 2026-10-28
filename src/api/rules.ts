import { USE_MOCK, mock, request } from './client';

export interface Rule { category: string; title: string; note: string; pts: number; }
export interface RulesData { merit: Rule[]; demerit: Rule[]; updatedAt: string; }

const MOCK: RulesData = {
  merit: [
    { category: '봉사', title: '교내 환경 정리 봉사', note: '1회당', pts: 3 },
    { category: '봉사', title: '학교 행사 진행 도움', note: '행사 1건', pts: 5 },
    { category: '학습', title: '수업 태도 우수', note: '교과 교사 추천', pts: 10 },
    { category: '학습', title: '방과후 멘토링 활동', note: '학기당 최대 2회', pts: 5 },
    { category: '생활', title: '분실물 습득 신고', note: '', pts: 2 },
    { category: '생활', title: '기숙사 생활 모범', note: '사감 교사 추천', pts: 5 },
  ],
  demerit: [
    { category: '생활', title: '지각', note: '1회당', pts: -2 },
    { category: '생활', title: '기숙사 소등 시간 미준수', note: '1회당', pts: -3 },
    { category: '생활', title: '복장 규정 위반', note: '', pts: -2 },
    { category: '학습', title: '수업 중 휴대폰 사용', note: '교과 교사 확인', pts: -3 },
    { category: '학습', title: '무단 결과', note: '1교시당', pts: -5 },
    { category: '공동체', title: '공용 시설 훼손', note: '고의인 경우', pts: -10 },
  ],
  updatedAt: '2026-09-01',
};

export const getRules = (signal?: AbortSignal) => (USE_MOCK ? mock(MOCK) : request<RulesData>('/rules', { signal }));
