import { z } from 'zod';

import { appConfig } from '@/constants/config';
import { resolveApiUrl, type ApiPath } from './config';

const errorSchema = z.object({ error: z.object({
  code: z.string(), message: z.string(), request_id: z.string().optional(),
  details: z.array(z.object({ field: z.string().optional() })).optional(),
}) });

export class ApiError extends Error {
  constructor(
    readonly code: string, message: string, readonly status?: number,
    readonly requestId?: string, readonly retryAfter?: number, readonly fields: string[] = [],
  ) { super(message); }
}

export function apiErrorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError && error.status && [400, 403, 404, 409, 422].includes(error.status)
    ? error.message : fallback;
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: object;
  token?: string;
  idempotencyKey?: string;
};

export function queryPath(path: ApiPath, params: Record<string, string | number | null | undefined>): ApiPath {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value != null && value !== '') query.set(key, String(value)); });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export async function apiRequest<T>(path: ApiPath, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  if (!appConfig.api.baseUrl) throw new ApiError('configuration', 'Configure the app API address.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    const response = await fetch(resolveApiUrl(path), {
      method: options.method ?? 'GET', headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal, redirect: 'error',
    });
    const raw = response.status === 204 ? undefined : await response.text();
    let data: unknown;
    if (raw) {
      try { data = JSON.parse(raw); } catch { /* Hosting failures may have a non-JSON body. */ }
    }
    if (!response.ok) {
      const result = errorSchema.safeParse(data);
      const error = result.success ? result.data.error : undefined;
      const retry = response.headers.get('Retry-After');
      throw new ApiError(error?.code ?? 'http_error', error?.message ?? 'The request could not be completed.',
        response.status, error?.request_id ?? response.headers.get('X-Request-ID') ?? undefined,
        retry && /^\d+$/.test(retry) ? Number(retry) : undefined, error?.details?.flatMap((issue) => issue.field ? [issue.field] : []));
    }
    const result = schema.safeParse(data);
    if (!result.success) throw new ApiError('invalid_response', 'The service returned an unexpected response.',
      response.status, response.headers.get('X-Request-ID') ?? undefined);
    return result.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('timeout', 'The request timed out.');
    throw new ApiError('network', 'Could not reach the service.');
  } finally {
    clearTimeout(timer);
  }
}

