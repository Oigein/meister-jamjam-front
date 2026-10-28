import { useState } from 'react';
import { getPointRules } from '../api/pointRules';
import { POINT_TYPE_LABEL, type PointType } from '../api/types';
import { useAsync } from '../lib/useAsync';
import { Loadable } from '../components/Loadable';
import './RulesPage.css';

/* 화면 진입 시 전체를 한 번 받고 필터·검색은 화면에서 처리 (명세 개요) */
export default function RulesPage() {
  const { state } = useAsync((s) => getPointRules({}, s), []);
  const [type, setType] = useState<PointType>('MERIT');
  const [cats, setCats] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const reset = () => { setCats([]); setQ(''); };

  return (
    <main className="page">
      <div>
        <p className="eyebrow">상벌점</p>
        <h1 className="page-title">기준 조회</h1>
        <p className="page-desc">어떤 행동에 몇 점이 부여되는지 확인할 수 있습니다. 학생 · 교사 모두 같은 기준을 봅니다.</p>
      </div>

      <Loadable state={state}>{(d) => {
        if (d.categories.length === 0) return <p className="status-msg">등록된 기준이 없습니다. 담당 선생님께 문의하세요.</p>;
        const query = q.trim().slice(0, 50);
        const ofType = d.items.filter((r) => r.type === type);
        const shown = ofType.filter((r) => (!cats.length || cats.includes(r.category)) && (!query || `${r.title} ${r.description ?? ''}`.includes(query)));
        const typeCats = [...new Set(ofType.map((r) => r.category))];
        const groups = typeCats.map((c) => ({ c, items: shown.filter((r) => r.category === c) })).filter((g) => g.items.length > 0);
        const count = (t: PointType) => d.items.filter((r) => r.type === t).length;
        const toggle = (c: string) => setCats((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));

        return (
          <>
            <div className="rl-bar">
              <div className="seg" role="tablist" aria-label="상점 · 벌점">
                {(['MERIT', 'DEMERIT'] as PointType[]).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? 'is-on' : ''}
                    onClick={() => { setType(t); setCats([]); }}>{POINT_TYPE_LABEL[t]}<small>{count(t)}</small></button>
                ))}
              </div>
              <input className="input rl-search" type="search" maxLength={50} placeholder="기준 검색 (예: 지각)" aria-label="기준 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            <div className="pills" role="group" aria-label="분류 (여러 개 선택 가능)">
              <button type="button" className={`pill ${cats.length === 0 ? 'is-on' : ''}`} aria-pressed={cats.length === 0} onClick={() => setCats([])}>전체</button>
              {typeCats.map((c) => (
                <button key={c} type="button" className={`pill ${cats.includes(c) ? 'is-on' : ''}`} aria-pressed={cats.includes(c)} onClick={() => toggle(c)}>{c}</button>
              ))}
            </div>

            <p className="muted rl-total">총 <b className="mono">{shown.length}</b>개</p>

            {groups.length === 0 ? (
              <p className="status-msg">조건에 맞는 기준이 없습니다. <button type="button" className="linkbtn" onClick={reset}>필터 초기화</button></p>
            ) : groups.map((g) => (
              <section key={g.c} className="card rl-group" aria-label={g.c}>
                <header><h2>{g.c}</h2><span className="mono muted">{g.items.length}개 기준</span></header>
                <table>
                  <thead><tr><th scope="col">기준</th><th scope="col">비고</th><th scope="col">점수</th></tr></thead>
                  <tbody>
                    {g.items.map((r) => (
                      <tr key={r.ruleId}>
                        <td>
                          <span className="rl-title">{r.title}</span>
                          {r.description && <small className="rl-desc">{r.description}</small>}
                        </td>
                        <td className="muted">{r.note || '—'}</td>
                        <td className={`mono strong ${r.type === 'MERIT' ? 'plus' : 'minus'}`}>{r.type === 'MERIT' ? '+' : '−'}{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}

            <p className="footnote">기준은 학교 규정에 따라 관리자가 수정하며, 바뀐 기준은 바로 반영됩니다.</p>
          </>
        );
      }}</Loadable>
    </main>
  );
}
