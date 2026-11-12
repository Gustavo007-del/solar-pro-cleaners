import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { clearBookingDraft } from '@/features/booking/hooks/useBookingDraft';
import { defaultLocale, i18n, localizationReady, type Locale } from '@/locales/i18n';
import { profileSchema } from '@/services/api/customerSchemas';
import { customerRequest, sessionService } from '@/services/api/session';
import { clearBookingReceipt } from '@/services/bookings/bookingService';
import { saveOnboardingStatus, savePreferredLanguage } from '@/services/storage/setupStorage';
import { type ApplicationProgress, getLaunchPhase, type LaunchPhase, loadApplication, toCustomerProfile } from '@/store/application';
import type { CustomerDetails, CustomerProfile } from '@/types/customerProfile';

type Startup = { status: 'loading' } | { status: 'unavailable'; error: unknown }
  | { status: 'ready'; progress: ApplicationProgress };
type ApplicationState = {
  phase: LaunchPhase;
  locale: Locale;
  profile?: CustomerProfile;
  knownInstallation: boolean;
  initializationError?: unknown;
  retryInitialization: () => void;
  setLocale: (locale: Locale) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  completeRegistration: (details: CustomerDetails) => Promise<void>;
  signIn: () => Promise<void>;
  logout: (all: boolean) => Promise<void>;
  editProfile: (details: Partial<CustomerDetails>) => Promise<void>;
  reloadProfile: () => Promise<CustomerProfile>;
};

const ApplicationContext = createContext<ApplicationState | undefined>(undefined);

export function ApplicationProvider({ children }: PropsWithChildren) {
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const accountWrites = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [progress] = await Promise.all([loadApplication(), localizationReady]);
        if (!active) return;
        await i18n.changeLanguage(progress.locale ?? defaultLocale);
        if (active) setStartup({ status: 'ready', progress });
      } catch (error) {
        if (active) setStartup({ status: 'unavailable', error });
      }
    })();
    return () => { active = false; };
  }, [attempt]);

  const progress = startup.status === 'ready' ? startup.progress : undefined;
  const locale = progress?.locale ?? defaultLocale;
  const profile = progress?.profile;

  const updateProgress = useCallback((change: Partial<ApplicationProgress>) => {
    setStartup((current) => current.status === 'ready'
      ? { status: 'ready', progress: { ...current.progress, ...change } }
      : current);
  }, []);

  useEffect(() => sessionService.subscribe(() => {
    if (profile) {
      clearBookingDraft(profile.customerId);
      clearBookingReceipt(profile.customerId);
    }
    updateProgress({ profile: undefined, knownInstallation: true });
  }), [profile, updateProgress]);

  const reloadProfile = useCallback(async () => {
    const next = toCustomerProfile(await customerRequest('/customers/me', profileSchema), locale);
    updateProgress({ profile: next });
    return next;
  }, [locale, updateProgress]);

  function writeAccount(task: () => Promise<void>) {
    const write = accountWrites.current.then(task);
    accountWrites.current = write.catch(() => undefined);
    return write;
  }

  const value: ApplicationState = {
    phase: progress ? getLaunchPhase(progress) : startup.status === 'ready' ? 'loading' : startup.status,
    locale, profile, knownInstallation: progress?.knownInstallation ?? false,
    initializationError: startup.status === 'unavailable' ? startup.error : undefined,
    retryInitialization() { setStartup({ status: 'loading' }); setAttempt((value) => value + 1); },
    setLocale(language) {
      return writeAccount(async () => {
        const previous = i18n.resolvedLanguage ?? defaultLocale;
        await i18n.changeLanguage(language);
        try { await savePreferredLanguage(language); }
        catch (error) { await i18n.changeLanguage(previous); throw error; }
        setStartup((current) => current.status === 'ready' ? {
          status: 'ready',
          progress: { ...current.progress, locale: language, profile: current.progress.profile
            ? { ...current.progress.profile, preferredLanguage: language } : undefined },
        } : current);
      });
    },
    editProfile(details) {
      return writeAccount(async () => {
        const body = {
          full_name: details.fullName, phone_number: details.primaryPhone,
          alternate_phone_number: 'alternatePhone' in details ? details.alternatePhone ?? null : undefined,
        };
        const next = await customerRequest('/customers/me', profileSchema, { method: 'PATCH', body });
        updateProgress({ profile: toCustomerProfile(next, i18n.resolvedLanguage === 'ml' ? 'ml' : 'en') });
      });
    },
    reloadProfile,
    async finishOnboarding() {
      await saveOnboardingStatus();
      updateProgress({ onboardingComplete: true });
    },
    async completeRegistration(details) {
      const customer = await sessionService.register(details);
      updateProgress({ profile: toCustomerProfile(customer, locale), knownInstallation: true });
    },
    async signIn() {
      const customer = await sessionService.signIn();
      updateProgress({ profile: toCustomerProfile(customer, locale), knownInstallation: true });
    },
    logout: sessionService.logout,
  };

  return <ApplicationContext.Provider value={value}>{children}</ApplicationContext.Provider>;
}

export function useApplication() {
  const value = useContext(ApplicationContext);
  if (!value) throw new Error('useApplication must be used within ApplicationProvider');
  return value;
}
