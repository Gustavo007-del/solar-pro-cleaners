import type { NextRequest } from 'next/server';

const authCookie = 'solar_admin_refresh';
const publicReads = new Set(['services', 'service-areas', 'business', 'availability']);
const adminGroups = new Set(['auth', 'me', 'users', 'bookings', 'customers', 'dashboard', 'technicians', 'notifications', 'crm']);
const cookieActions = new Set(['login', 'refresh', 'logout', 'logout-all', 'change-password']);
const maxBody = 65_536;

function fail(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: NextRequest) {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return body + decoder.decode();
      size += value.byteLength;
      if (size > maxBody) { await reader.cancel(); throw new RangeError(); }
      body += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
}

function settings(request: NextRequest) {
  const base = new URL(process.env.API_BASE_URL?.trim() || process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || '');
  const configured = process.env.DASHBOARD_ORIGIN;
  const origin = new URL(configured || request.nextUrl.origin);
  const deployed = process.env.NODE_ENV === 'production';
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
    || !['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/'
    || origin.search || origin.hash || (deployed && (!configured || origin.protocol !== 'https:' || base.protocol !== 'https:'))) {
    throw new Error('Invalid dashboard API configuration.');
  }
  base.pathname = base.pathname.replace(/\/+$/, '') || '/api/v1';
  return { base, origin: origin.origin };
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!path.length || path.length > 6 || path.some((part) => !/^[A-Za-z0-9_-]{1,80}$/.test(part))) {
    return fail(404, 'not_found', 'This resource is unavailable.');
  }
  const method = request.method;
  const isAdmin = path[0] === 'admin' && adminGroups.has(path[1]);
  const isPublic = method === 'GET' && publicReads.has(path[0]);
  if (!isAdmin && !isPublic) return fail(404, 'not_found', 'This resource is unavailable.');
  const cookieRoute = isAdmin && method === 'POST' && path.length === 3 && path[1] === 'auth' && cookieActions.has(path[2]);
  if (path[1] === 'auth' && !cookieRoute) return fail(404, 'not_found', 'This resource is unavailable.');

  let config;
  try { config = settings(request); } catch {
    return fail(503, 'api_configuration', 'The dashboard API connection is not configured.');
  }
  if (method !== 'GET' && request.headers.get('origin') !== config.origin) {
    return fail(403, 'origin_denied', 'This request origin is not allowed.');
  }

  const headers = new Headers({ Accept: 'application/json' });
  const bearer = request.headers.get('authorization');
  if (isAdmin && bearer && /^Bearer [A-Za-z0-9._-]+$/i.test(bearer)) headers.set('Authorization', bearer);
  if (method !== 'GET') headers.set('Origin', config.origin);
  if (cookieRoute && path[2] === 'refresh') {
    const cookie = request.cookies.get(authCookie)?.value;
    if (cookie && /^[A-Za-z0-9_-]{43}$/.test(cookie)) headers.set('Cookie', `${authCookie}=${cookie}`);
  }
  let body: string | undefined;
  if (method !== 'GET' && !(cookieRoute && path[2] === 'refresh')) {
    try { body = await readBody(request); } catch (error) {
      return error instanceof RangeError
        ? fail(413, 'request_too_large', 'The request exceeds the size limit.')
        : fail(400, 'invalid_body', 'Could not read the request body.');
    }
    if (cookieRoute && path[2] === 'login') {
      try {
        const login = JSON.parse(body ?? '') as { email?: unknown; password?: unknown };
        body = JSON.stringify({ email: login.email, password: login.password, transport: 'cookie' });
      } catch { return fail(422, 'invalid_body', 'Enter your email and password.'); }
    }
    if (body) headers.set('Content-Type', 'application/json');
  }

  const upstream = new URL(config.base.href);
  upstream.pathname += '/' + path.join('/');
  upstream.search = request.nextUrl.search;
  try {
    const response = await fetch(upstream, { method, headers, body: body || undefined, cache: 'no-store',
      redirect: 'error', signal: AbortSignal.timeout(15_000) });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of ['content-type', 'retry-after', 'x-request-id', 'www-authenticate']) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (cookieRoute) {
      for (const cookie of response.headers.getSetCookie()) {
        if (cookie.startsWith(authCookie + '=')) responseHeaders.append('Set-Cookie', cookie);
      }
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return fail(503, 'api_unavailable', 'The service could not be reached. Try again shortly.');
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };

