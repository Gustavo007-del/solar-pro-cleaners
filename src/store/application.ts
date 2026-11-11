import type { Locale } from '@/locales/i18n';
import { getCustomerProfile } from '@/services/storage/customerProfiles';
import { getOnboardingStatus, getPreferredLanguage } from '@/services/storage/setupStorage';
import type { CustomerProfile } from '@/types/customerProfile';

export type ApplicationProgress = {
  locale?: Locale;
  onboardingComplete: boolean;
  profile?: CustomerProfile;
};

export type LaunchPhase = 'loading' | 'unavailable' | 'language' | 'onboarding' | 'registration' | 'main';

export function getLaunchPhase(progress: ApplicationProgress): LaunchPhase {
  if (progress.profile) return 'main';
  if (!progress.locale) return 'language';
  return progress.onboardingComplete ? 'registration' : 'onboarding';
}

export async function loadApplication(): Promise<ApplicationProgress> {
  const [locale, onboardingComplete, profile] = await Promise.all([
    getPreferredLanguage(),
    getOnboardingStatus(),
    getCustomerProfile(),
  ]);

  return { locale: profile?.preferredLanguage ?? locale, onboardingComplete, profile };
}
