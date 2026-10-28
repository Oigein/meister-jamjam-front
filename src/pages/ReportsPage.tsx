import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  getReportPage, submitReport, updateReport, withdrawReport,
  type Report, type ReportMethod, type ReportPageData,
} from '../api/reports';
import { useAsync } from '../lib/useAsync';
import { formatBytes } from '../lib/format';
import { Loadable } from '../components/Loadable';
import { useToast } from '../components/Toast';
import { LockIcon, XIcon } from '../components/icons';
import './ReportsPage.css';

const TYPES = ['물품 분실 · 습득', '교칙 관련', '교우 관계', '학업 · 진로 고민', '기타 고민 상담'];
const METHODS: { id: ReportMethod; title: string; desc: string }[] = [
  { id: 'meeting', title: '면담 희망', desc: '선생님과 1:1로 이야기합니다' },
  { id: 'written', title: '서면 · 메시지 답변만', desc: '앱 안의 비밀 메시지로 답을 받습니다' },
  { id: 'notice', title: '단순 사실 알림', desc: '알리기만 하고 비밀로 처리를 요청합니다' },
];
const STEPS = ['확인 전', '확인 완료', '처리 중', '처리 완료'];
const MAX_FILES = 3;
const MAX_SIZE = 10 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'application/pdf'];
const TITLE_MAX = 50;
const CONTENT_MAX = 2000;

export default function ReportsPage() {
  const { state, setData } = useAsync((s) => getReportPage(s), []);
  return (
    <main className="page">
      <div>
        <p className="eyebrow">비공개</p>
        <h1 className="page-title">자진 신고</h1>
        <p className="page-desc rp-private"><LockIcon /> 다른 학생에게는 보이지 않으며, 선택한 선생님에게만 전달됩니다.</p>
      </div>
      <Loadable state={state}>{(d) => <Reports data={d} setData={setData} />}</Loadable>
    </main>
  );
}

function Reports({ data, setData }: { data: ReportPageData; setData: (f: (d: ReportPageData) => ReportPageData) => void }) {
  const { toast, show } = useToast();
  const homeroom = data.teachers.find((t) => t.homeroom) ?? data.teachers[0];

  const [editingId, setEditingId] = useState<string | null>(null);
  const [teacherIds, setTeacherIds] = useState<string[]>([homeroom.id]);
  const [picking, setPicking] = useState(false);
  const [type, setType] = useState(TYPES[0]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [method, setMethod] = useState<ReportMethod>('written');
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const valid = teacherIds.length > 0 && type && content.trim().length > 0;
  const others = data.teachers.filter((t) => !teacherIds.includes(t.id));

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of list) {
      if (!ACCEPT.includes(f.type)) { setFileError(`${f.name}: JPG, PNG, PDF만 올릴 수 있습니다.`); continue; }
      if (f.size > MAX_SIZE) { setFileError(`${f.name}: 10MB를 넘습니다.`); continue; }
      if (next.length >= MAX_FILES) { setFileError(`첨부파일은 최대 ${MAX_FILES}개입니다.`); break; }
      next.push(f);
    }
    setFiles(next);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    setFileError('');
    addFiles(e.dataTransfer.files);
  }

  function reset() {
    setEditingId(null);
    setTeacherIds([homeroom.id]);
    setType(TYPES[0]);
    setTitle('');
    setContent('');
    setFiles([]);
    setFileError('');
    setMethod('written');
  }

  function edit(r: Report) {
    setEditingId(r.id);
    setTeacherIds(r.teacherIds);
    setType(r.type);
    setTitle(r.title);
    setContent(r.content);
    setMethod(r.method);
    setFiles([]);
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function withdraw(r: Report) {
    if (!window.confirm(`'${r.title || '제목 없음'}' 신고를 철회할까요? 철회하면 되돌릴 수 없습니다.`)) return;
    try {
      await withdrawReport(r.id);
      setData((d) => ({ ...d, reports: d.reports.filter((x) => x.id !== r.id) }));
      if (editingId === r.id) reset();
      show('신고를 철회했습니다.');
    } catch {
      show('철회하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    try {
      const input = { teacherIds, type, title: title.trim() || content.trim().slice(0, 20), content: content.trim(), method, files };
      const saved = editingId ? await updateReport(editingId, input) : await submitReport(input);
      setData((d) => ({ ...d, reports: editingId ? d.reports.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...d.reports] }));
      show(editingId ? '신고 내용을 수정했습니다.' : '제출했습니다. 선생님이 확인하면 알림으로 알려드릴게요.');
      reset();
    } catch {
      show('제출하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rp-layout">
      <form ref={formRef} className="card rp-form" onSubmit={submit}>
        {editingId && (
          <div className="rp-editing">
            <span>제출한 신고를 수정하는 중입니다.</span>
            <button type="button" className="linkbtn" onClick={reset}>수정 취소</button>
          </div>
        )}

        <div className="field">
          <span className="label" id="rp-to">받는 선생님</span>
          <div className="rp-teachers" role="group" aria-labelledby="rp-to">
            {teacherIds.map((id) => {
              const t = data.teachers.find((x) => x.id === id)!;
              return (
                <span key={id} className="rp-teacher">
                  {t.name} <small>{t.role}{t.homeroom ? ' · 기본' : ''}</small>
                  {teacherIds.length > 1 && (
                    <button type="button" aria-label={`${t.name} 빼기`} onClick={() => setTeacherIds(teacherIds.filter((x) => x !== id))}><XIcon size={14} /></button>
                  )}
                </span>
              );
            })}
            {others.length > 0 && (picking ? (
              <select className="select rp-pick" autoFocus defaultValue="" aria-label="추가할 선생님"
                onChange={(e) => { if (e.target.value) setTeacherIds([...teacherIds, e.target.value]); setPicking(false); }}
                onBlur={() => setPicking(false)}>
                <option value="" disabled>선생님 선택</option>
                {others.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.role}</option>)}
              </select>
            ) : (
              <button type="button" className="btn btn-dashed rp-addteacher" onClick={() => setPicking(true)}>담당 교사 변경 · 추가</button>
            ))}
          </div>
        </div>

        <div className="rp-row">
          <div className="field">
            <label className="label" htmlFor="rp-type"><span>신고 유형 <span className="req">*</span></span></label>
            <select id="rp-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="rp-title"><span>제목</span><span className="mono">{title.length}/{TITLE_MAX}</span></label>
            <input id="rp-title" className="input" maxLength={TITLE_MAX} placeholder="한 줄로 요약해 주세요" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="rp-content"><span>내용 <span className="req">*</span></span><span className="mono">{content.length}/{CONTENT_MAX}</span></label>
          <textarea id="rp-content" className="textarea" maxLength={CONTENT_MAX} placeholder="언제, 어디서, 어떤 일이 있었는지 편하게 적어 주세요." value={content} onChange={(e) => setContent(e.target.value)} />
        </div>

        <div className="field">
          <span className="label">첨부파일 (선택, 최대 {MAX_FILES}개 · 개당 10MB)</span>
          <div className={`rp-drop ${dragging ? 'is-drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={files.length >= MAX_FILES}>
              파일을 끌어오거나 눌러서 선택 · JPG, PNG, PDF
            </button>
            <input ref={fileRef} type="file" hidden multiple accept=".jpg,.jpeg,.png,.pdf"
              onChange={(e) => { setFileError(''); addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          {fileError && <p className="text-minus rp-small" role="alert">{fileError}</p>}
          {files.length > 0 && (
            <ul className="rp-files">
              {files.map((f, i) => (
                <li key={f.name + i}>
                  <span>{f.name} <span className="mono muted">{formatBytes(f.size)}</span></span>
                  <button type="button" aria-label={`${f.name} 삭제`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><XIcon size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <fieldset className="field rp-methods">
          <legend className="label"><span>희망 처리 방식 <span className="req">*</span></span></legend>
          {METHODS.map((m) => (
            <label key={m.id} className={`rp-method ${method === m.id ? 'is-on' : ''}`}>
              <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
              <span><b>{m.title}</b><small>{m.desc}</small></span>
            </label>
          ))}
        </fieldset>

        <p className="rp-notice">본 자진 신고는 담당 선생님에게만 안전하게 전달됩니다. 신중하게 작성해 주세요. 선생님이 확인하기 전까지는 수정하거나 철회할 수 있습니다.</p>
        <div className="rp-submit">
          <button type="submit" className="btn btn-primary btn-lg" disabled={!valid || sending}>
            {sending ? '보내는 중…' : editingId ? '수정하기' : '제출하기'}
          </button>
        </div>
      </form>

      <aside className="rp-side" aria-labelledby="rp-hist">
        <h2 id="rp-hist" className="section-title">내 신고 내역</h2>
        {data.reports.length === 0 && <p className="status-msg">아직 보낸 신고가 없습니다.</p>}
        {data.reports.map((r) => (
          <article key={r.id} className={`card rp-item ${editingId === r.id ? 'is-editing' : ''}`}>
            <div className="rp-item-top"><h3>{r.title}</h3><span className="mono muted">{r.date}</span></div>
            <p className="muted rp-small">{r.type} · {r.teacherNames}</p>
            <ol className="rp-steps" aria-label={`진행 상태: ${STEPS[r.step]}`}>
              {STEPS.map((s, i) => <li key={s} className={`${i <= r.step ? 'is-done' : ''} ${i === r.step ? 'is-now' : ''}`}>{s}</li>)}
            </ol>
            {r.step === 0 && (
              <div className="rp-actions">
                <button type="button" className="btn btn-sm" onClick={() => edit(r)}>수정</button>
                <button type="button" className="btn btn-sm text-minus" onClick={() => withdraw(r)}>철회</button>
              </div>
            )}
            {r.reply && (
              <div className="rp-reply">
                <small>{r.reply.teacher} 답변</small>
                <p>{r.reply.text}</p>
              </div>
            )}
          </article>
        ))}
      </aside>
      {toast}
    </div>
  );
}
