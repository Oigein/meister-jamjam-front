import { useState } from 'react';
import { getRules } from '../api/rules';
import { useAsync } from '../lib/useAsync';
import { signed } from '../lib/format';
import { Loadable } from '../components/Loadable';
import './RulesPage.css';

type Tab = 'merit' | 'demerit';

export default function RulesPage() {
  const { state } = useAsync((s) => getRules(s), []);
  const [tab, setTab] = useState<Tab>('merit');
  const [cat, setCat] = useState('전체');
  const [q, setQ] = useState('');

  return (
    <main className="page">
      <div>
        <p className="eyebrow">상벌점</p>
        <h1 className="page-title">기준 조회</h1>
        <p className="page-desc">어떤 행동에 몇 점이 부여되는지 확인할 수 있습니다. 학생 · 교사 모두 같은 기준을 봅니다.</p>
      </div>

      <Loadable state={state}>{(d) => {
        const list = d[tab];
        const cats = [...new Set(list.map((r) => r.category))];
        const query = q.trim();
        const shown = list.filter((r) => (cat === '전체' || r.category === cat) && (!query || `${r.title} ${r.note}`.includes(query)));
        const groups = cats.map((c) => ({ c, items: shown.filter((r) => r.category === c) })).filter((g) => g.items.length > 0);

        return (
          <>
            <div className="rl-bar">
              <div className="seg" role="tablist" aria-label="상점 · 벌점">
                {([['merit', '상점', d.merit.length], ['demerit', '벌점', d.demerit.length]] as [Tab, string, number][]).map(([k, label, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''}
                    onClick={() => { setTab(k); setCat('전체'); }}>{label}<small>{n}</small></button>
                ))}
              </div>
              <input className="input rl-search" type="search" placeholder="기준 검색 (예: 지각)" aria-label="기준 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="pills" role="group" aria-label="분류">
              {['전체', ...cats].map((c) => (
                <button key={c} type="button" className={`pill ${cat === c ? 'is-on' : ''}`} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>

            {groups.length === 0 ? <p className="status-msg">조건에 맞는 기준이 없습니다.</p> : groups.map((g) => (
              <section key={g.c} className="card rl-group" aria-label={g.c}>
                <header><h2>{g.c}</h2><span className="mono muted">{g.items.length}개 기준</span></header>
                <table>
                  <thead><tr><th scope="col">기준</th><th scope="col">비고</th><th scope="col">점수</th></tr></thead>
                  <tbody>
                    {g.items.map((r) => (
                      <tr key={r.title}>
                        <td>{r.title}</td>
                        <td className="muted">{r.note || '—'}</td>
                        <td className={`mono strong ${r.pts > 0 ? 'plus' : 'minus'}`}>{signed(r.pts)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            <p className="footnote">기준은 학교 규정에 따라 관리자가 수정합니다. 마지막 수정 <span className="mono">{d.updatedAt}</span></p>
          </>
        );
      }}</Loadable>
    </main>
  );
}
