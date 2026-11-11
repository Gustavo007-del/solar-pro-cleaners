import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { appMetadata } from '@/constants/metadata';

import en from './en.json';
import ml from './ml.json';

export const resources = {
  en: { translation: { ...en, brand: { ...en.brand, name: appMetadata.name } } },
  ml: { translation: { ...ml, brand: { ...ml.brand, name: appMetadata.nameMl } } },
} as const;
export type Locale = keyof typeof resources;
export const defaultLocale: Locale = 'en';

export const localizationReady = i18n.use(initReactI18next).init({
  resources,
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: Object.keys(resources),
  interpolation: { escapeValue: false },
  initAsync: false,
  react: { useSuspense: false },
});

export { i18n };
