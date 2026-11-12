import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { appConfig } from '@/constants/config';
import type { CreateBookingInput } from './bookingService';

const entry = z.object({ fingerprint: z.string(), id: z.uuid() });
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
let queue = Promise.resolve();

function serialized<T>(task: () => Promise<T>) {
  const next = queue.then(task);
  queue = next.then(() => undefined, () => undefined);
  return next;
}

async function key(customerId: string) {
  const scope = await digestStringAsync(CryptoDigestAlgorithm.SHA256, `${appConfig.api.baseUrl}/${customerId}`);
  return `solar-care.booking.${scope}`;
}

async function read(key: string) {
  const raw = await SecureStore.getItemAsync(key, options);
  if (!raw) return undefined;
  try {
    const parsed = entry.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function prepareSubmission(customerId: string, request: CreateBookingInput) {
  return serialized(async () => {
    const storageKey = await key(customerId);
    const fingerprint = await digestStringAsync(CryptoDigestAlgorithm.SHA256, JSON.stringify(request));
    const previous = await read(storageKey);
    if (previous?.fingerprint === fingerprint) return previous.id;
    const id = randomUUID();
    await SecureStore.setItemAsync(storageKey, JSON.stringify({ fingerprint, id }), options);
    return id;
  });
}

export function resolveSubmission(customerId: string, id: string) {
  return serialized(async () => {
    const storageKey = await key(customerId);
    if ((await read(storageKey))?.id === id) await SecureStore.deleteItemAsync(storageKey, options);
  });
}

