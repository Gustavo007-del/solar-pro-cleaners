import { digestStringAsync, CryptoDigestAlgorithm, getRandomBytesAsync } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { appConfig } from '@/constants/config';
import type { CustomerDetails } from '@/types/customerProfile';
import { ApiError, apiRequest, type RequestOptions } from './client';
import type { ApiPath } from './config';
import { authSchema, profileSchema, tokensSchema, type ServerProfile } from './customerSchemas';

const savedSchema = z.object({
  installation: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  state: z.enum(['registering', 'active', 'signed_out']),
  tokens: tokensSchema.optional(), accessUntil: z.number().optional(),
});
type SavedSession = z.infer<typeof savedSchema>;
const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let stored: SavedSession | undefined;
let load: Promise<void> | undefined;
let refresh: Promise<ServerProfile> | undefined;
let epoch = 0;
let signingOut = false;
let authWrites = Promise.resolve();
const invalidationListeners = new Set<() => void>();

async function storageKey() {
  const base = appConfig.api.baseUrl;
  if (!base) throw new ApiError('configuration', 'Configure the app API address.');
  return `solar-care.session.${await digestStringAsync(CryptoDigestAlgorithm.SHA256, base)}`;
}

async function initialize() {
  if (!appConfig.api.baseUrl) return;
  load ??= (async () => {
    const raw = await SecureStore.getItemAsync(await storageKey(), storageOptions);
    if (raw === null) return;
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { /* Invalid or obsolete local record. */ }
    const result = savedSchema.safeParse(parsed);
    if (result.success) stored = result.data;
    else await SecureStore.deleteItemAsync(await storageKey(), storageOptions);
  })().catch((error) => { load = undefined; throw error; });
  return load;
}

async function persist(value: SavedSession) {
  await SecureStore.setItemAsync(await storageKey(), JSON.stringify(value), storageOptions);
  stored = value;
}

async function newInstallation() {
  const bytes = await getRandomBytesAsync(32);
  let credential = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    credential += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < bytes.length) credential += alphabet[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < bytes.length) credential += alphabet[c & 63];
  }
  return credential;
}

function unauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

function ended() { return new ApiError('session_ended', 'Sign in to continue.', 401); }

function serialize<T>(task: () => Promise<T>) {
  const next = authWrites.then(task);
  authWrites = next.then(() => undefined, () => undefined);
  return next;
}

async function invalidate(installation: string) {
  await persist({ installation, state: 'signed_out' });
  epoch++;
  invalidationListeners.forEach((listener) => listener());
}

async function saveAuthentication(session: SavedSession, result: z.infer<typeof authSchema>) {
  await persist({ installation: session.installation, state: 'active', tokens: result.tokens,
    accessUntil: Date.now() + result.tokens.expires_in * 1000 });
  return result.customer;
}

async function installationLogin(session: SavedSession) {
  return saveAuthentication(session, await apiRequest('/customers/auth/login', authSchema, {
    method: 'POST', body: { installation_credential: session.installation },
  }));
}

function recover(): Promise<ServerProfile> {
  refresh ??= serialize(async () => {
    const session = stored;
    if (!session || session.state !== 'active') throw ended();
    // Persist the removal before spending a single-use token. A crash or lost reply then uses installation login.
    await persist({ installation: session.installation, state: 'active' });
    if (session.tokens && Date.parse(session.tokens.refresh_expires_at) > Date.now()) {
      try {
        const result = await apiRequest('/customers/auth/refresh', authSchema, {
          method: 'POST', body: { refresh_token: session.tokens.refresh_token },
        });
        return await saveAuthentication(session, result);
      } catch (error) {
        if (!unauthorized(error)) throw error;
      }
    }
    try {
      return await installationLogin(session);
    } catch (error) {
      if (unauthorized(error)) await invalidate(session.installation);
      throw error;
    }
  }).finally(() => { refresh = undefined; });
  return refresh;
}

export async function customerRequest<T>(path: ApiPath, schema: z.ZodType<T>, options?: RequestOptions): Promise<T> {
  if (signingOut) throw ended();
  const requestEpoch = epoch;
  if (refresh) await refresh;
  if (!stored || stored.state !== 'active' || epoch !== requestEpoch) throw ended();
  if (!stored.tokens || (stored.accessUntil ?? 0) <= Date.now() + 5_000) await recover();
  const token = stored.tokens?.access_token;
  if (!token || epoch !== requestEpoch) throw ended();
  try {
    const data = await apiRequest(path, schema, { ...options, token });
    if (epoch !== requestEpoch) throw ended();
    return data;
  } catch (error) {
    if (!unauthorized(error) || signingOut || epoch !== requestEpoch) throw error;
    if (refresh) await refresh;
    else if (stored?.tokens?.access_token === token || !stored?.tokens) await recover();
    if (!stored?.tokens || epoch !== requestEpoch) throw ended();
    const retryToken = stored.tokens.access_token;
    try {
      const data = await apiRequest(path, schema, { ...options, token: retryToken });
      if (epoch !== requestEpoch) throw ended();
      return data;
    } catch (retryError) {
      if (unauthorized(retryError) && !signingOut && epoch === requestEpoch) {
        await serialize(async () => {
          if (stored?.tokens?.access_token === retryToken && epoch === requestEpoch) {
            await invalidate(stored.installation);
          }
        });
      }
      throw retryError;
    }
  }
}

export const sessionService = {
  subscribe(listener: () => void) {
    invalidationListeners.add(listener);
    return () => { invalidationListeners.delete(listener); };
  },
  async restore() {
    await initialize();
    const current = stored;
    if (!current) return { knownInstallation: false };
    if (current.state === 'signed_out') return { knownInstallation: true };
    if (current.state === 'registering') {
      try {
        const profile = await serialize(() => installationLogin(current));
        return { knownInstallation: true, profile };
      } catch (error) {
        if (unauthorized(error)) return { knownInstallation: false };
        throw error;
      }
    }
    try {
      const profile = current.tokens && (current.accessUntil ?? 0) > Date.now() + 5_000
        ? await customerRequest('/customers/me', profileSchema) : await recover();
      return { knownInstallation: true, profile };
    } catch (error) {
      if (unauthorized(error)) return { knownInstallation: true };
      throw error;
    }
  },
  register(details: CustomerDetails) {
    return serialize(async () => {
      await initialize();
      if (stored?.state === 'active' || stored?.state === 'signed_out') return installationLogin(stored);
      const session: SavedSession = stored ?? { installation: await newInstallation(), state: 'registering' };
      await persist(session);
      try {
        const result = await apiRequest('/customers/register', authSchema, {
          method: 'POST', body: { full_name: details.fullName, phone_number: details.primaryPhone,
            alternate_phone_number: details.alternatePhone ?? null, installation_credential: session.installation },
        });
        return await saveAuthentication(session, result);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'installation_already_registered') return installationLogin(session);
        throw error;
      }
    });
  },
  signIn() {
    return serialize(async () => {
      await initialize();
      if (!stored) throw ended();
      return installationLogin(stored);
    });
  },
  async logout(all: boolean) {
    if (signingOut) return;
    signingOut = true;
    try {
      if (refresh) await refresh;
      if (stored?.state === 'active') {
        const path = all ? '/customers/auth/logout-all' : '/customers/auth/logout';
        const revoke = () => apiRequest(path, z.object({ status: z.literal('ok') }), {
          method: 'POST', token: stored?.tokens?.access_token,
        });
        try {
          if (!stored.tokens || (stored.accessUntil ?? 0) <= Date.now() + 5_000) await recover();
          await revoke();
        } catch (error) {
          if (!unauthorized(error)) throw error;
          if (stored?.state === 'active') {
            try { await recover(); await revoke(); }
            catch (retryError) { if (!unauthorized(retryError)) throw retryError; }
          }
        }
      }
      await serialize(async () => {
        if (stored && stored.state !== 'signed_out') await invalidate(stored.installation);
      });
    } finally {
      signingOut = false;
    }
  },
};

