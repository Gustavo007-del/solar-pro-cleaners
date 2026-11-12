export type QueryParams = Record<string, string | number | boolean | undefined>;
export type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: object; token?: string; signal?: AbortSignal };

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly requestId?: string,
    readonly retryAfter?: string) { super(message); this.name = 'ApiError'; }
}

export function queryPath(path: string, params: QueryParams) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError('Could not connect to the service. Check your connection and try again.', 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => undefined);
  if (!response.ok) {
    const issue = data?.error;
    const message = typeof issue?.message === 'string' ? issue.message
      : response.status >= 500 ? 'The service is temporarily unavailable.' : 'The request could not be completed.';
    throw new ApiError(message, response.status, issue?.code, issue?.request_id ?? response.headers.get('X-Request-ID'),
      response.headers.get('Retry-After') ?? undefined);
  }
  if (data === undefined) throw new ApiError('The service returned an unexpected response.', 502);
  return data as T;
}

