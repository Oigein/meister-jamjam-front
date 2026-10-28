/*
 * API 호출 공통 (docs/api/00-common.md)
 * - VITE_USE_MOCK=false 이면 실제 백엔드, 그 외에는 src/api/mock 의 목업 서버로 응답
 * - VITE_API_ORIGIN: 백엔드 주소. 비우면 같은 도메인(/api, /auth를 Vercel·Vite 프록시로 넘기는 구성)
 */
export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';
export const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(/\/$/, '');

export interface FieldError { field: string; reason: string; message: string; }

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: FieldError[] = [],
    public body: Record<string, unknown> = {},
  ) { super(message); }
}

type QueryValue = string | number | boolean | null | undefined | (string | number)[];
export interface ApiInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown; // 객체(JSON) 또는 FormData
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function buildQuery(query?: Record<string, QueryValue>) {
  if (!query) return '';
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
    else qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const DEFAULT_MESSAGE: Record<number, string> = {
  400: '입력값을 확인해 주세요.',
  401: '로그인이 필요합니다.',
  403: '권한이 없습니다.',
  404: '대상을 찾을 수 없습니다.',
  409: '이미 처리되었거나 충돌이 있습니다.',
  413: '파일 용량이 너무 큽니다.',
  415: '허용되지 않은 파일 형식입니다.',
  429: '요청이 많습니다. 잠시 후 다시 시도하세요.',
  502: '외부 서비스 응답이 늦습니다. 다시 시도하세요.',
};
const defaultMessage = (status: number) => DEFAULT_MESSAGE[status] ?? '서버 오류가 발생했습니다. 다시 시도하세요.';

/* 401: 현재 주소를 기억하고 로그인 화면으로 */
export function redirectToLogin() {
  if (location.pathname === '/login') return;
  const back = location.pathname + location.search;
  location.assign(`/login?redirect=${encodeURIComponent(back)}`);
}

export async function api<T>(path: string, init: ApiInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const url = path + buildQuery(init.query);

  if (USE_MOCK) {
    const { mockRequest } = await import('./mock/server');
    return mockRequest<T>(method, url, init.body, init.signal);
  }

  const isForm = init.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(API_ORIGIN + url, {
      method,
      credentials: 'include',
      signal: init.signal,
      headers: { Accept: 'application/json', ...(init.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', '네트워크 연결을 확인하세요.');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) redirectToLogin();
    throw new ApiError(
      res.status,
      typeof body.code === 'string' ? body.code : `HTTP_${res.status}`,
      typeof body.message === 'string' ? body.message : defaultMessage(res.status),
      Array.isArray(body.fieldErrors) ? (body.fieldErrors as FieldError[]) : [],
      body,
    );
  }
  if (res.status === 204 || res.status === 304) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return (ct.includes('json') ? res.json() : undefined) as Promise<T>;
}

/*
 * text/event-stream 응답 읽기 (LLM 답변 스트리밍 등)
 * onEvent(event, data): data는 서버가 보낸 문자열 그대로 (JSON이면 호출하는 쪽에서 파싱)
 */
export async function apiStream(path: string, body: unknown, onEvent: (event: string, data: string) => void, signal?: AbortSignal): Promise<void> {
  if (USE_MOCK) {
    const { mockStream } = await import('./mock/server');
    return mockStream(path, body, onEvent, signal);
  }
  const res = await fetch(API_ORIGIN + path, {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 401) redirectToLogin();
    throw new ApiError(res.status, String(err.code ?? `HTTP_${res.status}`), String(err.message ?? defaultMessage(res.status)));
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = 'message';
      const data: string[] = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
      }
      if (data.length) onEvent(event, data.join('\n'));
    }
  }
}

/* 화면 표시용 */
export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.';

/* 입력 검증 실패(400) → { 필드명: 문구 } */
export const fieldErrorMap = (e: unknown): Record<string, string> =>
  e instanceof ApiError ? Object.fromEntries(e.fieldErrors.map((f) => [f.field, f.message])) : {};
