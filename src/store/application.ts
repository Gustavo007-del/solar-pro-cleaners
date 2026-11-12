import type { Locale } from '@/locales/i18n';
import { sessionService } from '@/services/api/session';
import type { ServerProfile } from '@/services/api/customerSchemas';
import { getOnboardingStatus, getPreferredLanguage } from '@/services/storage/setupStorage';
import type { CustomerProfile } from '@/types/customerProfile';

export type ApplicationProgress = {
  locale?: Locale;
  onboardingComplete: boolean;
  knownInstallation: boolean;
  profile?: CustomerProfile;
};

export type LaunchPhase = 'loading' | 'unavailable' | 'language' | 'onboarding' | 'registration' | 'main';

export function toCustomerProfile(profile: ServerProfile, locale: Locale): CustomerProfile {
  return {
    customerId: profile.id, fullName: profile.full_name, primaryPhone: profile.phone_number,
    alternatePhone: profile.alternate_phone_number ?? undefined, preferredLanguage: locale,
    createdAt: profile.created_at, updatedAt: profile.updated_at,
  };
}

export function getLaunchPhase(progress: ApplicationProgress): LaunchPhase {
  if (progress.profile) return 'main';
  if (!progress.locale) return 'language';
  return progress.onboardingComplete || progress.knownInstallation ? 'registration' : 'onboarding';
}

export async function loadApplication(): Promise<ApplicationProgress> {
  const [locale, onboardingComplete, session] = await Promise.all([
    getPreferredLanguage(), getOnboardingStatus(), sessionService.restore(),
  ]);
  return {
    locale, onboardingComplete, knownInstallation: session.knownInstallation,
    profile: session.profile ? toCustomerProfile(session.profile, locale ?? 'en') : undefined,
  };
}
