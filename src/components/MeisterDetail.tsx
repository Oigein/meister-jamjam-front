import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GitHubIcon, LinkedInIcon } from './icons';
import './MeisterDetail.css';

/* ---------- 타입 ---------- */
export interface ScoreItem { name: string; meta: string; raw: number; conv: number; max: number; }
export interface ScoreArea { name: string; raw: number; conv: number; max: number; items: ScoreItem[]; }
export interface PointRecord { reason: string; meta: string; pts: number; teacher: string; }
export interface HistoryRecord { date: string; title: string; meta: string; delta: number; evidenceUrl?: string; }
export interface GradeRule { grade: string; range: string; }

export interface MeisterDetailProps {
  student: { name: string; grade: number; cls: number; num: number; major: string; githubUrl?: string | null; linkedinUrl?: string | null; };
  total: number;
  convGrade: string;
  rank: number;
  areas: ScoreArea[];
  points: PointRecord[];
  history: HistoryRecord[];
  gradeRules: GradeRule[];
  gradeNote?: string;
}

/* ---------- 유틸 ---------- */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

/* 그리기 직전 한 번 더 표준 주소 확인 (명세 2.3 안전 처리) */
const safe = (url: string | null | undefined, prefix: string) => (url && url.startsWith(prefix) ? url : null);

type PtTab = 'merit' | 'demerit' | 'teacher';

export default function MeisterDetail(props: MeisterDetailProps) {
  const { student, total, convGrade, rank, areas, points, history, gradeRules, gradeNote } = props;
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true });
  const [ptTab, setPtTab] = useState<PtTab>('merit');

  const allOpen = areas.length > 0 && areas.every((_, i) => open[i]);
  const toggleAll = () => setOpen(Object.fromEntries(areas.map((_, i) => [i, !allOpen])));

  const merits = points.filter((p) => p.pts > 0);
  const demerits = points.filter((p) => p.pts < 0);
  const meritSum = sum(merits, (p) => p.pts);
  const demeritSum = sum(demerits, (p) => p.pts);

  let groups: { head?: string; sum?: number; items: PointRecord[] }[];
  if (ptTab === 'merit') groups = [{ items: merits }];
  else if (ptTab === 'demerit') groups = [{ items: demerits }];
  else {
    const by = new Map<string, PointRecord[]>();
    points.forEach((p) => by.set(p.teacher, [...(by.get(p.teacher) ?? []), p]));
    groups = [...by].map(([head, items]) => ({ head, sum: sum(items, (p) => p.pts), items }));
  }

  const github = safe(student.githubUrl, 'https://github.com/');
  const linkedin = safe(student.linkedinUrl, 'https://www.linkedin.com/in/');

  return (
    <main className="md">
      <Link className="md-back" to="/ranking">‹ 랭킹으로</Link>

      {/* 프로필 */}
      <section className="md-profile">
        <div className="md-who">
          <span className="md-avatar" aria-hidden="true">{student.name.slice(-2, -1)}</span>
          <div className="md-col6">
            <div className="md-namerow">
              <h1 className="md-name">{student.name}</h1>
              {github && (
                <a className="md-iconbtn" href={github} target="_blank" rel="noopener noreferrer" aria-label="GitHub 프로필 새 탭으로 열기" title={github.replace('https://', '')}><GitHubIcon /></a>
              )}
              {linkedin && (
                <a className="md-iconbtn" href={linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn 프로필 새 탭으로 열기" title={linkedin.replace('https://www.', '')}><LinkedInIcon /></a>
              )}
            </div>
            <span className="md-sub">{student.grade}학년 {student.cls}반 {student.num}번 · {student.major}</span>
          </div>
        </div>
        <div className="md-stats">
          <div className="md-stat"><span>총점</span><strong className="mono">{total}</strong></div>
          <div className="md-stat"><span>환산 등급</span><strong className="mono accent">{convGrade}</strong></div>
          <div className="md-stat"><span>전체 순위</span><strong className="mono">{rank}<small>위</small></strong></div>
        </div>
      </section>

      <div className="md-layout">
        <div className="md-main">
          {/* 영역별 점수 */}
          <section aria-labelledby="area-h" className="md-col12">
            <div className="md-sechead">
              <h2 id="area-h">영역별 점수</h2>
              <button type="button" className="md-btn-sm" onClick={toggleAll}>{allOpen ? '모두 접기' : '모두 펼치기'}</button>
            </div>
            <div className="md-table">
              <div className="md-row md-thead">
                <span>평가 영역 · 항목</span><span>원점수</span><span>환산</span><span>최대</span>
              </div>
              {areas.map((a, i) => (
                <div key={a.name} className="md-area">
                  <button type="button" className={`md-row md-arearow${open[i] ? ' is-open' : ''}`} aria-expanded={!!open[i]}
                    onClick={() => setOpen({ ...open, [i]: !open[i] })}>
                    <span className="md-areaname"><span className="md-chev mono">{open[i] ? '▾' : '▸'}</span>{a.name} <small>{a.items.length}건</small></span>
                    <span className="mono">{a.raw}</span>
                    <span className="mono strong">{a.conv}</span>
                    <span className="mono muted">{a.max}</span>
                  </button>
                  {open[i] && (
                    <div className="md-items">
                      {a.items.length === 0 && <p className="md-empty">등록된 내역 없음</p>}
                      {a.items.map((it) => (
                        <div key={it.name} className="md-row md-item">
                          <span className="md-itemname"><span>{it.name}</span><small className="mono">{it.meta}</small></span>
                          <span className="mono">{it.raw}</span>
                          <span className="mono">{it.conv}</span>
                          <span className="mono muted">{it.max}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="md-row md-tfoot">
                <span>합계</span>
                <span className="mono">{sum(areas, (a) => a.raw)}</span>
                <span className="mono">{sum(areas, (a) => a.conv)}</span>
                <span className="mono muted">{sum(areas, (a) => a.max)}</span>
              </div>
            </div>
          </section>

          {/* 변동 내역 */}
          <section aria-labelledby="hist-h" className="md-col12">
            <h2 id="hist-h">점수 변동 내역</h2>
            <ol className="md-history">
              {history.map((h) => (
                <li key={h.date + h.title}>
                  <span className="mono muted md-date">{h.date}</span>
                  <span className="md-col4">
                    <span>{h.title}</span>
                    <span className="md-meta">{h.meta}{h.evidenceUrl && <> · <a href={h.evidenceUrl}>증빙 보기</a></>}</span>
                  </span>
                  <span className={`mono md-delta ${h.delta >= 0 ? 'plus' : 'minus'}`}>{signed(h.delta)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="md-side">
          {/* 상벌점 */}
          <section aria-labelledby="pt-h" className="md-card md-pt">
            <div className="md-pt-top">
              <h2 id="pt-h">상벌점</h2>
              <div className="md-ptsum">
                <div><span>상점</span><strong className="mono plus">{signed(meritSum)}</strong></div>
                <div><span>벌점</span><strong className="mono minus">{signed(demeritSum)}</strong></div>
                <div><span>합계</span><strong className="mono">{signed(meritSum + demeritSum)}</strong></div>
              </div>
              <div role="tablist" aria-label="상벌점 보기" className="md-tabs">
                {([['merit', '상점'], ['demerit', '벌점'], ['teacher', '교사별']] as [PtTab, string][]).map(([k, label]) => (
                  <button key={k} type="button" role="tab" aria-selected={ptTab === k} className={ptTab === k ? 'is-on' : ''} onClick={() => setPtTab(k)}>{label}</button>
                ))}
              </div>
            </div>
            {groups.map((g, gi) => (
              <div key={g.head ?? gi}>
                {g.head && <div className="md-grouphead"><span>{g.head}</span><span className="mono">{signed(g.sum ?? 0)}</span></div>}
                {g.items.length === 0 && <p className="md-empty md-pad">등록된 내역 없음</p>}
                {g.items.map((p) => (
                  <div key={p.reason + p.meta} className="md-ptrow">
                    <span className="md-col2"><span>{p.reason}</span><small>{p.meta}</small></span>
                    <span className={`mono ${p.pts > 0 ? 'plus' : 'minus'}`}>{signed(p.pts)}</span>
                  </div>
                ))}
              </div>
            ))}
            <Link className="md-cardlink" to="/rules">상벌점 기준 보기 ›</Link>
          </section>

          {/* 환산 등급 기준 */}
          <section aria-labelledby="gr-h" className="md-card md-grade">
            <h2 id="gr-h">환산 등급 기준</h2>
            {gradeRules.length === 0 ? (
              <p className="md-empty">환산 등급 기준이 아직 등록되지 않았습니다.</p>
            ) : (
              <table>
                <thead><tr><th scope="col">등급</th><th scope="col">환산 점수</th></tr></thead>
                <tbody>
                  {gradeRules.map((g) => (
                    <tr key={g.grade} className={g.grade === convGrade ? 'is-me' : ''}>
                      <td className="mono">{g.grade}</td><td className="mono">{g.range}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {gradeNote && <p className="md-note">{gradeNote}</p>}
          </section>
        </aside>
      </div>
    </main>
  );
}

/* ---------- 디자인 확인용 예시 데이터 (실제 API 응답으로 교체) ---------- */
export const sampleProps: MeisterDetailProps = {
  student: { name: '손범수', grade: 2, cls: 1, num: 9, major: '소프트웨어개발과', githubUrl: 'https://github.com/octocat', linkedinUrl: 'https://www.linkedin.com/in/example' },
  total: 452, convGrade: 'B+', rank: 14,
  areas: [
    { name: '자격증', raw: 160, conv: 150, max: 300, items: [
      { name: '정보처리기능사', meta: '2026-09-18 · 김지훈 선생님', raw: 100, conv: 100, max: 100 },
      { name: '리눅스마스터 2급', meta: '2026-05-02 · 김지훈 선생님', raw: 60, conv: 50, max: 50 } ] },
    { name: '대회 · 공모전', raw: 180, conv: 160, max: 250, items: [
      { name: '교내 해커톤 금상', meta: '2026-07-11 · 박서연 선생님', raw: 100, conv: 100, max: 100 },
      { name: '부산 SW 아이디어 공모전 장려', meta: '2026-04-20 · 박서연 선생님', raw: 80, conv: 60, max: 60 } ] },
    { name: '프로젝트 · 포트폴리오', raw: 98, conv: 92, max: 200, items: [
      { name: '나르샤 프로젝트 완료', meta: '2026-07-01 · 이도현 선생님', raw: 98, conv: 92, max: 100 } ] },
    { name: '인성 · 봉사', raw: 50, conv: 50, max: 150, items: [
      { name: '봉사활동 20시간', meta: '2026-06-30 · 담임', raw: 50, conv: 50, max: 50 } ] },
    { name: '외국어', raw: 0, conv: 0, max: 100, items: [] },
  ],
  points: [
    { reason: '학급 환경 정리 봉사', meta: '10-14 · 김지훈 선생님', pts: 3, teacher: '김지훈 선생님' },
    { reason: '교내 행사 진행 도움', meta: '09-22 · 박서연 선생님', pts: 5, teacher: '박서연 선생님' },
    { reason: '수업 태도 우수', meta: '09-03 · 김지훈 선생님', pts: 10, teacher: '김지훈 선생님' },
    { reason: '지각', meta: '10-02 · 이도현 선생님', pts: -2, teacher: '이도현 선생님' },
    { reason: '기숙사 소등 시간 미준수', meta: '09-15 · 이도현 선생님', pts: -3, teacher: '이도현 선생님' },
  ],
  history: [
    { date: '2026-10-28', title: '정보처리기능사 승인', meta: '자격증 · 김지훈 선생님', delta: 10, evidenceUrl: '#' },
    { date: '2026-10-02', title: '벌점 · 지각', meta: '상벌점 · 이도현 선생님', delta: -2 },
    { date: '2026-07-11', title: '교내 해커톤 금상', meta: '대회 · 박서연 선생님', delta: 100, evidenceUrl: '#' },
    { date: '2026-07-01', title: '나르샤 프로젝트 완료', meta: '프로젝트 · 이도현 선생님', delta: 92, evidenceUrl: '#' },
    { date: '2026-05-02', title: '리눅스마스터 2급 (최대 인정 50점)', meta: '자격증 · 김지훈 선생님', delta: 50, evidenceUrl: '#' },
  ],
  gradeRules: [
    { grade: 'A', range: '500 이상' }, { grade: 'B+', range: '440 – 499' }, { grade: 'B', range: '380 – 439' },
    { grade: 'C', range: '300 – 379' }, { grade: 'D', range: '300 미만' },
  ],
  gradeNote: '원점수는 영역별 최대 인정 점수까지만 환산됩니다. A까지 48점 남았습니다.',
};
