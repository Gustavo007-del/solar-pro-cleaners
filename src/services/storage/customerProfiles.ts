import AsyncStorage from '@react-native-async-storage/async-storage';

import { appConfig } from '@/constants/config';
import { customerProfileSchema, type CustomerDetails, type CustomerProfile } from '@/types/customerProfile';

const key = appConfig.storage.customerProfile;

export function saveCustomerProfile(profile: CustomerProfile) {
  return AsyncStorage.setItem(key, JSON.stringify(customerProfileSchema.parse(profile)));
}

export async function getCustomerProfile(): Promise<CustomerProfile | undefined> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }

  return customerProfileSchema.safeParse(value).data;
}

export function clearCustomerProfile() {
  return AsyncStorage.removeItem(key);
}

export async function updateCustomerProfile(
  customerId: string,
  changes: Partial<CustomerDetails & Pick<CustomerProfile, 'preferredLanguage'>>,
): Promise<CustomerProfile> {
  const current = await getCustomerProfile();
  if (!current || current.customerId !== customerId) throw new Error('Customer profile unavailable');

  const updated = customerProfileSchema.parse({ ...current, ...changes, updatedAt: new Date().toISOString() });
  if (changes.preferredLanguage) {
    await AsyncStorage.multiSet([
      [key, JSON.stringify(updated)],
      [appConfig.storage.locale, updated.preferredLanguage],
    ]);
  } else {
    await saveCustomerProfile(updated);
  }
  return updated;
}
