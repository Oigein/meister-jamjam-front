/* 대회 화면 공용 표시 요소 (목록·상세·추천 카드) */
export const Stars = ({ n }: { n: number }) => (
  <span className="ct-stars" aria-label={`난이도 5점 중 ${n}점`}>{'★'.repeat(n)}<span>{'★'.repeat(Math.max(0, 5 - n))}</span></span>
);

export const BookmarkIcon = ({ on }: { on: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
  </svg>
);
