import { z } from 'zod';
import { ApiError, request, type Options } from './api-client';
import { routes } from './routes';
import type { Profile } from '@/types/api';

const profileSchema = z.object({
  id: z.uuid(), full_name: z.string(), email: z.string(), role: z.enum(['owner', 'admin', 'staff']),
  is_active: z.boolean(), created_at: z.string(), updated_at: z.string(), last_login_at: z.string().nullable(),
  permissions: z.array(z.string()),
});
const authSchema = z.object({
  admin: profileSchema,
  tokens: z.object({ access_token: z.string().min(1), refresh_token: z.null(), expires_in: z.number().positive() }),
});
const liveSchema = z.object({ profile: profileSchema, token: z.string(), expiresAt: z.number() });
type LiveSession = z.infer<typeof liveSchema>;
type Session = { state: 'loading' | 'anonymous' } | { state: 'unavailable'; error: unknown } | { state: 'active'; value: LiveSession };
const initial: Session = { state: 'loading' };
let snapshot: Session = initial;
let flight: Promise<LiveSession> | undefined;
let channel: BroadcastChannel | undefined;
let generation = 0;
const listeners = new Set<() => void>();

function publish(session: Session) {
  snapshot = session;
  listeners.forEach((listener) => listener());
}

function setSession(value: LiveSession, notify = true) {
  publish({ state: 'active', value });
  if (notify) channel?.postMessage({ type: 'session', value });
  return value;
}

function clear(notify = true) {
  generation++;
  publish({ state: 'anonymous' });
  if (notify) channel?.postMessage({ type: 'clear' });
}

function current() { return snapshot.state === 'active' ? snapshot.value : undefined; }
function usable(value: LiveSession | undefined) {
  return Boolean(value && value.expiresAt > Date.now() + 20_000);
}

function startChannel() {
  if (typeof window === 'undefined' || channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('solar-care-admin-auth');
  channel.onmessage = ({ data }) => {
    if (data?.type === 'clear') clear(false);
    if (data?.type === 'session') {
      const parsed = liveSchema.safeParse(data.value);
      if (parsed.success && usable(parsed.data)) setSession(parsed.data, false);
    }
    if (data?.type === 'who') {
      const value = current();
      if (value && usable(value)) channel?.postMessage({ type: 'session', value });
    }
  };
}

async function withLock<T>(task: () => Promise<T>): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request('solar-care-admin-session', task) : await task();
}

function authenticated(payload: unknown) {
  const result = authSchema.safeParse(payload);
  if (!result.success) throw new ApiError('The service returned an unexpected sign-in response.', 502);
  return setSession({
    profile: result.data.admin, token: result.data.tokens.access_token,
    expiresAt: Date.now() + result.data.tokens.expires_in * 1000,
  });
}

function refresh(previous?: string): Promise<LiveSession> {
  if (flight) return flight;
  startChannel();
  const revision = generation;
  flight = withLock(async () => {
    if (channel && (!current() || current()?.token === previous)) {
      if (!current()) channel.postMessage({ type: 'who' });
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    const peer = current();
    if (generation !== revision) throw new ApiError('Sign in to continue.', 401);
    if (peer && usable(peer) && peer.token !== previous) return peer;
    const response = await request<unknown>(routes.auth('refresh'), { method: 'POST' });
    if (generation !== revision) throw new ApiError('Sign in to continue.', 401);
    return authenticated(response);
  }).catch((error) => {
    if (generation === revision && error instanceof ApiError && error.status === 401) clear();
    throw error;
  }).finally(() => { flight = undefined; });
  return flight;
}

export const auth = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  snapshot: () => snapshot,
  initial: () => initial,
  async restore() {
    startChannel();
    if (usable(current()) || snapshot.state === 'anonymous') return;
    publish(initial);
    try { await refresh(); } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) publish({ state: 'unavailable', error });
    }
  },
  async login(email: string, password: string) {
    startChannel();
    return withLock(async () => authenticated(await request(routes.auth('login'), { method: 'POST', body: { email, password } })));
  },
  async logout(all: boolean) {
    const access = current();
    if (!access) { clear(); return; }
    await adminRequest(routes.auth(all ? 'logout-all' : 'logout'), { method: 'POST' });
    clear();
  },
  updateProfile(profile: Profile) {
    const value = current();
    if (value) setSession({ ...value, profile });
  },
  async changePassword(body: { current_password: string; new_password: string }) {
    const access = current();
    if (!usable(access)) await refresh(access?.token);
    return withLock(async () => {
      const value = current();
      if (!value) throw new ApiError('Sign in to continue.', 401);
      return authenticated(await request(routes.auth('change-password'), { method: 'POST', token: value.token, body }));
    });
  },
};

export async function adminRequest<T>(path: string, options: Options = {}): Promise<T> {
  const before = current();
  if (!before) throw new ApiError('Sign in to continue.', 401);
  const revision = generation;
  const access = usable(before) ? before : await refresh(before.token);
  try {
    return await request<T>(path, { ...options, token: access.token });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 401) || options.signal?.aborted || revision !== generation) throw error;
    const value = await refresh(access.token);
    try {
      return await request<T>(path, { ...options, token: value.token });
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401 && generation === revision && current()?.token === value.token) clear();
      throw retryError;
    }
  }
}

