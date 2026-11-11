import { randomUUID } from 'expo-crypto';

import type { Locale } from '@/locales/i18n';
import { saveCustomerProfile } from '@/services/storage/customerProfiles';
import type { CustomerDetails, CustomerProfile } from '@/types/customerProfile';

export async function registerCustomer(details: CustomerDetails, preferredLanguage: Locale): Promise<CustomerProfile> {
  const now = new Date().toISOString();
  const profile: CustomerProfile = {
    ...details,
    customerId: randomUUID(),
    preferredLanguage,
    createdAt: now,
    updatedAt: now,
  };

  await saveCustomerProfile(profile);
  return profile;
}
