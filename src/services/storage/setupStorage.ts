import AsyncStorage from '@react-native-async-storage/async-storage';

import { appConfig } from '@/constants/config';
import type { Locale } from '@/locales/i18n';

const { locale, onboarding } = appConfig.storage;

export async function getPreferredLanguage(): Promise<Locale | undefined> {
  const value = await AsyncStorage.getItem(locale);
  return value === 'en' || value === 'ml' ? value : undefined;
}

export function savePreferredLanguage(language: Locale) {
  return AsyncStorage.setItem(locale, language);
}

export async function getOnboardingStatus(): Promise<boolean> {
  return (await AsyncStorage.getItem(onboarding)) === 'complete';
}

export function saveOnboardingStatus() {
  return AsyncStorage.setItem(onboarding, 'complete');
}
