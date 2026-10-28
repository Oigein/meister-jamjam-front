/* 백엔드 연동 지점. VITE_API_BASE_URL이 비어 있으면 목업 모드로 동작 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export const USE_MOCK = API_BASE === '';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(isForm ? {} : { 'Content-Type': 'application/json' }), ...init?.headers },
    // 쿠키 세션 인증을 쓰게 되면 'include'로 변경
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const post = <T,>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

/* 목업 응답: 네트워크처럼 약간 늦게, 원본이 바뀌지 않도록 복사해서 돌려줌 */
export const mock = <T,>(data: T, ms = 120): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(data)), ms));
