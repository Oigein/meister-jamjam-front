/*
 * 목업 서버: docs/api 명세대로 응답하는 가짜 백엔드 (VITE_USE_MOCK=false면 번들에 포함되지 않음)
 * 도메인별 핸들러는 ./handlers/*.ts 에서 route()/stream()으로 등록
 */
import { ApiError, type FieldError } from '../client';
import type { Page } from '../types';

export interface Ctx {
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
type Handler = (ctx: Ctx) => unknown | Promise<unknown>;
type StreamHandler = (ctx: Ctx, emit: (event: string, data: string) => void) => Promise<void>;

interface Route<H> { method: string; re: RegExp; keys: string[]; handler: H; }
const routes: Route<Handler>[] = [];
const streams: Route<StreamHandler>[] = [];

function compile(pattern: string) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { re, keys };
}

export function route(method: string, pattern: string, handler: Handler) {
  routes.push({ method, ...compile(pattern), handler });
}
export function stream(method: string, pattern: string, handler: StreamHandler) {
  streams.push({ method, ...compile(pattern), handler });
}

/* 핸들러 안에서 오류 응답: fail(409, 'EVIDENCE_ALREADY_REVIEWED', '이미 처리된 증빙자료입니다.') */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors: FieldError[] = [], public extra: Record<string, unknown> = {}) { super(message); }
}
export function fail(status: number, code: string, message: string, extra: { fieldErrors?: FieldError[]; [k: string]: unknown } = {}): never {
  const { fieldErrors = [], ...rest } = extra;
  throw new HttpError(status, code, message, fieldErrors, rest);
}
export const validationFail = (fieldErrors: FieldError[]): never => fail(400, 'VALIDATION_FAILED', '입력값을 확인해 주세요.', { fieldErrors });

export function paginate<T>(xs: T[], pageParam: string | null, size = 20): Page<T> {
  const totalPages = Math.max(1, Math.ceil(xs.length / size));
  let page = Number(pageParam ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > totalPages) page = 1;
  return { items: xs.slice((page - 1) * size, page * size), page, size, totalElements: xs.length, totalPages: xs.length ? totalPages : 0 };
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); });
  });

let loaded: Promise<unknown> | null = null;
const ensureLoaded = () => (loaded ??= import('./handlers'));

function match<H>(list: Route<H>[], method: string, path: string) {
  for (const r of list) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) return { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

function toApiError(e: unknown): unknown {
  if (e instanceof HttpError) return new ApiError(e.status, e.code, e.message, e.fieldErrors, { code: e.code, message: e.message, ...e.extra });
  return e;
}

export async function mockRequest<T>(method: string, url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  await ensureLoaded();
  await sleep(150 + Math.random() * 150, signal);
  const u = new URL(url, 'http://mock');
  const found = match(routes, method, u.pathname);
  if (!found) throw new ApiError(404, 'NOT_FOUND', `목업에 없는 API입니다: ${method} ${u.pathname}`);
  try {
    const res = await found.r.handler({ method, params: found.params, query: u.searchParams, body });
    return (res === undefined ? undefined : structuredClone(res)) as T;
  } catch (e) {
    throw toApiError(e);
  }
}

export async function mockStream(path: string, body: unknown, onEvent: (event: string, data: string) => void, signal?: AbortSignal) {
  await ensureLoaded();
  await sleep(300, signal);
  const u = new URL(path, 'http://mock');
  const found = match(streams, 'POST', u.pathname);
  if (!found) throw new ApiError(404, 'NOT_FOUND', `목업에 없는 스트림 API입니다: ${u.pathname}`);
  try {
    await found.r.handler({ method: 'POST', params: found.params, query: u.searchParams, body }, (ev, data) => {
      if (!signal?.aborted) onEvent(ev, data);
    });
  } catch (e) {
    throw toApiError(e);
  }
}
