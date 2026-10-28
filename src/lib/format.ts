export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export const pad2 = (n: number) => String(n).padStart(2, '0');

/* 3글자 이름은 가운데 글자(예: 손범수 → 범), 그 외에는 첫 글자 */
export const avatarChar = (name: string) => (name.length === 3 ? name[1] : name[0] ?? '');

export function daysUntil(date: string, today = new Date()) {
  const d = new Date(`${date}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export function ddayLabel(date: string) {
  const n = daysUntil(date);
  return n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : '마감';
}

export const todayMMDD = () => {
  const d = new Date();
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export function formatBytes(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
