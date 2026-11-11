import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { registerCustomer } from '@/features/registration/customerRegistration';
import { defaultLocale, i18n, localizationReady, type Locale } from '@/locales/i18n';
import { updateCustomerProfile } from '@/services/storage/customerProfiles';
import { saveOnboardingStatus, savePreferredLanguage } from '@/services/storage/setupStorage';
import { type ApplicationProgress, getLaunchPhase, type LaunchPhase, loadApplication } from '@/store/application';
import type { CustomerDetails, CustomerProfile } from '@/types/customerProfile';

type Startup = { status: 'loading' | 'unavailable' } | { status: 'ready'; progress: ApplicationProgress };
type ApplicationState = {
  phase: LaunchPhase;
  locale: Locale;
  profile?: CustomerProfile;
  retryInitialization: () => void;
  setLocale: (locale: Locale) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  completeRegistration: (details: CustomerDetails) => Promise<void>;
  editProfile: (details: Partial<CustomerDetails>) => Promise<void>;
};

const ApplicationContext = createContext<ApplicationState | undefined>(undefined);

export function ApplicationProvider({ children }: PropsWithChildren) {
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const accountWrites = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const [progress] = await Promise.all([loadApplication(), localizationReady]);
        if (!active) return;
        await i18n.changeLanguage(progress.locale ?? defaultLocale);
        if (active) setStartup({ status: 'ready', progress });
      } catch {
        if (active) setStartup({ status: 'unavailable' });
      }
    }

    void initialize();
    return () => { active = false; };
  }, [attempt]);

  const retryInitialization = useCallback(() => {
    setStartup({ status: 'loading' });
    setAttempt((current) => current + 1);
  }, []);

  const phase = startup.status === 'ready' ? getLaunchPhase(startup.progress) : startup.status;
  const locale = (startup.status === 'ready' ? startup.progress.locale : undefined) ?? defaultLocale;
  const profile = startup.status === 'ready' ? startup.progress.profile : undefined;

  function updateProgress(change: Partial<ApplicationProgress>) {
    setStartup((current) => current.status === 'ready'
      ? { status: 'ready', progress: { ...current.progress, ...change } }
      : current);
  }

  function writeAccount(task: () => Promise<void>) {
    const write = accountWrites.current.then(task);
    accountWrites.current = write.catch(() => undefined);
    return write;
  }

  const value: ApplicationState = {
    phase,
    locale,
    profile,
    retryInitialization,
    setLocale(language) {
      return writeAccount(async () => {
        const previousLanguage = i18n.resolvedLanguage ?? defaultLocale;
        await i18n.changeLanguage(language);
        try {
          if (profile) {
            const updated = await updateCustomerProfile(profile.customerId, { preferredLanguage: language });
            updateProgress({ locale: language, profile: updated });
          } else {
            await savePreferredLanguage(language);
            updateProgress({ locale: language });
          }
        } catch (error) {
          await i18n.changeLanguage(previousLanguage);
          throw error;
        }
      });
    },
    editProfile(details) {
      return writeAccount(async () => {
        if (!profile) throw new Error('Customer profile unavailable');
        const updated = await updateCustomerProfile(profile.customerId, details);
        updateProgress({ profile: updated });
      });
    },
    async finishOnboarding() {
      await saveOnboardingStatus();
      updateProgress({ onboardingComplete: true });
    },
    async completeRegistration(details) {
      const customer = await registerCustomer(details, locale);
      updateProgress({ profile: customer });
    },
  };

  return <ApplicationContext.Provider value={value}>{children}</ApplicationContext.Provider>;
}

export function useApplication() {
  const value = useContext(ApplicationContext);
  if (!value) throw new Error('useApplication must be used within ApplicationProvider');
  return value;
}
