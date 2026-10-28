import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getRanking } from '../api/ranking';
import { useAsync } from '../lib/useAsync';
import { Loadable } from '../components/Loadable';
import './RankingPage.css';

const SIZE = 20;
const GRADES: [number, string][] = [[0, '전체'], [1, '1학년'], [2, '2학년'], [3, '3학년']];

export default function RankingPage() {
  const [grade, setGrade] = useState(0);
  const [page, setPage] = useState(1);
  const { state } = useAsync((s) => getRanking({ grade, page, size: SIZE }, s), [grade, page]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">마이스터 역량</p>
          <h1 className="page-title">점수 랭킹</h1>
        </div>
        <div className="seg" role="tablist" aria-label="학년">
          {GRADES.map(([g, label]) => (
            <button key={g} type="button" role="tab" aria-selected={grade === g} className={grade === g ? 'is-on' : ''}
              onClick={() => { setGrade(g); setPage(1); }}>{label}</button>
          ))}
        </div>
      </div>

      <Loadable state={state}>{(d) => {
        const pages = Math.max(1, Math.ceil(d.count / SIZE));
        const start = Math.max(1, Math.min(page - 2, pages - 4));
        const nums = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
        return (
          <>
            {d.me && (
              <section className="card rk-sum" aria-label="내 순위 요약">
                <div><span>{grade ? `${grade}학년 내 순위` : '전체 내 순위'}</span><strong className="mono">{d.me.rank}<small>위</small><em>/ {d.count}</em></strong></div>
                <div><span>내 총점</span><strong className="mono">{d.me.total}<small>점</small></strong></div>
                <div><span>바로 위 학생과 차이</span><strong className="mono">{d.me.gap ?? '—'}{d.me.gap != null && <small>점</small>}</strong></div>
                <div className="rk-cta"><Link to="/students/me" className="btn btn-primary btn-lg">내 역량 상세 보기 ›</Link></div>
              </section>
            )}

            <div className="card rk-table">
              <table>
                <thead>
                  <tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">학년</th><th scope="col">반</th><th scope="col">번호</th><th scope="col">총점</th></tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.id} className={r.isMe ? 'is-me' : ''}>
                      <td className={`mono ${r.rank <= 3 ? 'strong' : ''}`}>{r.rank}</td>
                      <td><Link to={r.isMe ? '/students/me' : `/students/${r.id}`}>{r.name}</Link>{r.isMe && <span className="rk-me">나</span>}</td>
                      <td className="mono">{r.grade}</td>
                      <td className="mono">{r.cls}</td>
                      <td className="mono">{r.num}</td>
                      <td>
                        <span className="rk-score">
                          <span className="mono">{r.total}</span>
                          <span className="rk-bar" aria-hidden="true"><i style={{ width: `${(r.total / d.maxScore) * 100}%` }} /></span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rk-foot">
                <span className="mono muted">{(page - 1) * SIZE + 1}-{Math.min(page * SIZE, d.count)} / {d.count}명</span>
                <nav className="pager" aria-label="페이지">
                  <button type="button" className="pager-text" disabled={page === 1} onClick={() => setPage(page - 1)}>‹ 이전</button>
                  {nums.map((n) => (
                    <button key={n} type="button" className={n === page ? 'is-on' : ''} aria-current={n === page ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
                  ))}
                  <button type="button" className="pager-text" disabled={page === pages} onClick={() => setPage(page + 1)}>다음 ›</button>
                </nav>
              </div>
            </div>
          </>
        );
      }}</Loadable>

      <p className="footnote">총점이 같으면 같은 순위이며, 학년 · 반 · 번호 순으로 표시합니다. 이름을 누르면 해당 학생의 상세 조회로 이동합니다.</p>
    </main>
  );
}
