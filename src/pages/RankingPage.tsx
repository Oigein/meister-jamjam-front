import { Link, useSearchParams } from 'react-router-dom';
import { getRanking } from '../api/ranking';
import { useAsync } from '../lib/useAsync';
import { useMe } from '../lib/session';
import { Loadable } from '../components/Loadable';
import './RankingPage.css';

const GRADES: [number | null, string][] = [[null, '전체'], [1, '1학년'], [2, '2학년'], [3, '3학년']];

export default function RankingPage() {
  const me = useMe();
  // 뒤로 가기로 돌아왔을 때 학년·페이지가 유지되도록 URL 쿼리에 보관 (명세 2.2)
  const [params, setParams] = useSearchParams();
  const gradeParam = Number(params.get('grade'));
  const grade = [1, 2, 3].includes(gradeParam) ? gradeParam : null;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const go = (g: number | null, p?: number) => {
    const next = new URLSearchParams();
    if (g) next.set('grade', String(g));
    if (p && p > 1) next.set('page', String(p));
    setParams(next);
  };

  const { state } = useAsync((s) => getRanking({ grade, page }, s), [grade, page]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">마이스터 역량</p>
          <h1 className="page-title">점수 랭킹</h1>
        </div>
        <div className="seg" role="tablist" aria-label="학년">
          {GRADES.map(([g, label]) => (
            <button key={label} type="button" role="tab" aria-selected={grade === g} className={grade === g ? 'is-on' : ''} onClick={() => go(g)}>{label}</button>
          ))}
        </div>
      </div>

      {state.status === 'error' && state.code === 400 ? (
        <p className="status-msg">잘못된 학년입니다. <button type="button" className="linkbtn" onClick={() => go(null)}>전체 학년 보기</button></p>
      ) : (
        <Loadable state={state}>{(d) => {
          // 서버가 잘못된 페이지를 1페이지로 돌려주면 주소도 맞춰 둠
          if (d.page !== page && page !== 1) queueMicrotask(() => go(grade, d.page));
          const start = Math.max(1, Math.min(d.page - 2, d.totalPages - 4));
          const nums = Array.from({ length: Math.min(5, d.totalPages) }, (_, i) => start + i);
          const maxScore = Math.max(1, d.items[0]?.totalScore ?? 1);
          return (
            <>
              {d.myRank && (
                <section className="card rk-sum" aria-label="내 순위 요약">
                  <div><span>{grade ? `${grade}학년 내 순위` : '전체 내 순위'}</span><strong className="mono">{d.myRank.rank}<small>위</small><em>/ {d.totalElements}</em></strong></div>
                  <div><span>내 총점</span><strong className="mono">{d.myRank.totalScore}<small>점</small></strong></div>
                  <div className="rk-mine">
                    <span>내 위치</span>
                    {d.myRank.page === d.page
                      ? <strong className="rk-here">이 페이지에 있어요</strong>
                      : <button type="button" className="btn" onClick={() => go(grade, d.myRank!.page)}>{d.myRank.page}페이지로 이동</button>}
                  </div>
                  <div className="rk-cta"><Link to={`/students/${d.myRank.studentId}`} className="btn btn-primary btn-lg">내 역량 상세 보기 ›</Link></div>
                </section>
              )}

              {d.items.length === 0 ? (
                <p className="status-msg">{d.grade ? '해당 학년의 학생 정보가 없습니다.' : '등록된 랭킹 정보가 없습니다.'}</p>
              ) : (
                <div className="card rk-table">
                  <table>
                    <thead>
                      <tr><th scope="col">순위</th><th scope="col">이름</th><th scope="col">학년</th><th scope="col">반</th><th scope="col">번호</th><th scope="col">총점</th></tr>
                    </thead>
                    <tbody>
                      {d.items.map((r) => (
                        <tr key={r.studentId} className={r.isMe ? 'is-me' : ''}>
                          <td className={`mono ${r.rank <= 3 ? 'strong' : ''}`}>{r.rank}</td>
                          <td><Link to={`/students/${r.studentId}`}>{r.name}</Link>{r.isMe && <span className="rk-me">나</span>}</td>
                          <td className="mono">{r.grade}</td>
                          <td className="mono">{r.classNo}</td>
                          <td className="mono">{r.number}</td>
                          <td>
                            <span className="rk-score">
                              <span className="mono">{r.totalScore}</span>
                              <span className="rk-bar" aria-hidden="true"><i style={{ width: `${(r.totalScore / maxScore) * 100}%` }} /></span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="rk-foot">
                    <span className="mono muted">{(d.page - 1) * d.size + 1}-{Math.min(d.page * d.size, d.totalElements)} / {d.totalElements}명</span>
                    <nav className="pager" aria-label="페이지">
                      <button type="button" className="pager-text" disabled={d.page === 1} onClick={() => go(grade, d.page - 1)}>‹ 이전</button>
                      {nums.map((n) => (
                        <button key={n} type="button" className={n === d.page ? 'is-on' : ''} aria-current={n === d.page ? 'page' : undefined} onClick={() => go(grade, n)}>{n}</button>
                      ))}
                      <button type="button" className="pager-text" disabled={d.page >= d.totalPages} onClick={() => go(grade, d.page + 1)}>다음 ›</button>
                    </nav>
                  </div>
                </div>
              )}
            </>
          );
        }}</Loadable>
      )}

      <p className="footnote">
        총점이 같으면 같은 순위이며, 학년 · 반 · 번호 순으로 표시합니다. 이름을 누르면 해당 학생의 상세 조회로 이동합니다.
        {!me.student && ' 교사 계정에는 내 순위가 표시되지 않습니다.'}
      </p>
    </main>
  );
}
