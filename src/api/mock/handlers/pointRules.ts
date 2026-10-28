import { route } from '../server';
import { pointRules } from '../db';

route('GET', '/api/point-rules', ({ query }) => {
  const active = pointRules.filter((r) => r.isActive);
  const type = query.get('type');
  const cats = query.getAll('category');
  const q = (query.get('q') ?? '').trim().slice(0, 50);
  const items = active
    .filter((r) => (type !== 'MERIT' && type !== 'DEMERIT') || r.type === type)
    .filter((r) => !cats.length || cats.includes(r.category))
    .filter((r) => !q || `${r.title} ${r.description ?? ''}`.includes(q))
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'MERIT' ? -1 : 1) || a.category.localeCompare(b.category) || b.points - a.points)
    .map(({ isActive: _a, ...r }) => r);
  return { total: items.length, categories: [...new Set(active.map((r) => r.category))], items };
});
