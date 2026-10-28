/* 교사용 학생 검색·선택 (GET /api/teacher/students) */
import { useEffect, useId, useState } from 'react';
import { searchStudents, type StudentSearch, type TeacherStudent } from '../api/award';
import { errorMessage } from '../api/client';
import { studentNo } from '../api/types';
import './StudentPicker.css';

/* "2109" → 2학년 1반 9번, "2" → 2학년, "21" → 2학년 1반, 그 외 글자는 이름 */
export function parseStudentQuery(text: string): StudentSearch | null {
  const t = text.trim();
  if (!t) return null;
  const out: StudentSearch = {};
  const names: string[] = [];
  for (const tok of t.split(/\s+/)) {
    if (/^\d{4}$/.test(tok)) { out.grade = Number(tok[0]); out.classNo = Number(tok[1]); out.number = Number(tok.slice(2)); }
    else if (/^\d{3}$/.test(tok)) { out.grade = Number(tok[0]); out.classNo = Number(tok[1]); out.number = Number(tok[2]); }
    else if (/^\d{2}$/.test(tok)) { out.grade = Number(tok[0]); out.classNo = Number(tok[1]); }
    else if (/^\d$/.test(tok)) out.grade = Number(tok);
    else names.push(tok);
  }
  if (names.length) out.q = names.join(' ');
  return out;
}

export default function StudentPicker({ value, onChange, label = '대상 학생' }: { value: TeacherStudent | null; onChange: (s: TeacherStudent | null) => void; label?: string }) {
  const id = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<{ status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; items: TeacherStudent[]; total: number }>({ status: 'idle' });

  useEffect(() => {
    const q = parseStudentQuery(text);
    if (!q) { setState({ status: 'idle' }); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setState({ status: 'loading' });
      searchStudents(q, ctrl.signal)
        .then((p) => setState({ status: 'ok', items: p.items, total: p.totalElements }))
        .catch((e) => { if (!ctrl.signal.aborted) setState({ status: 'error', message: errorMessage(e) }); });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [text]);

  if (value) {
    return (
      <div className="field">
        <span className="label">{label}</span>
        <div className="sp-picked">
          <div>
            <b>{value.name}</b> <span className="mono muted">{studentNo(value)}</span>
            <p className="muted">{value.grade}학년 {value.classNo}반 {value.number}번 · 총점 <span className="mono">{value.totalScore}</span>{value.pendingEvidenceCount > 0 && <> · 검토 대기 {value.pendingEvidenceCount}건</>}</p>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => onChange(null)}>변경</button>
        </div>
      </div>
    );
  }

  return (
    <div className="field sp">
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" type="search" autoComplete="off" placeholder="이름 또는 학번 (예: 손범수, 2109)" value={text} onChange={(e) => setText(e.target.value)} />
      {state.status === 'idle' && <p className="sp-hint muted">이름 일부나 학번(학년·반·번호 4자리)으로 찾습니다. 둘 다 쓰면 모두 만족하는 학생만 보입니다.</p>}
      {state.status === 'loading' && <p className="sp-hint muted">찾는 중…</p>}
      {state.status === 'error' && <p className="sp-hint text-minus" role="alert">{state.message}</p>}
      {state.status === 'ok' && (state.items.length === 0 ? <p className="sp-hint muted">검색 결과가 없습니다.</p> : (
        <ul className="sp-list" aria-label="검색 결과">
          {state.items.map((s) => (
            <li key={s.studentId}>
              <button type="button" onClick={() => { onChange(s); setText(''); }}>
                <span><b>{s.name}</b> <span className="mono muted">{studentNo(s)}</span></span>
                <span className="muted sp-meta">총점 <span className="mono">{s.totalScore}</span>{s.pendingEvidenceCount > 0 && <> · 대기 {s.pendingEvidenceCount}</>}</span>
              </button>
            </li>
          ))}
          {state.total > state.items.length && <li className="sp-more muted">{state.total}명 중 {state.items.length}명 표시 · 검색어를 더 구체적으로 입력하세요.</li>}
        </ul>
      ))}
    </div>
  );
}
