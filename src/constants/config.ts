import { appEnvironment, getPublicApiBaseUrl } from './environment';

export const appConfig = {
  environment: appEnvironment,
  api: {
    baseUrl: getPublicApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
  },
  business: {
    supportPhone: '+919061444017',
    legalName: process.env.EXPO_PUBLIC_BUSINESS_LEGAL_NAME?.trim() || undefined,
    privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || undefined,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL?.trim() || undefined,
    deletionUrl: process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL?.trim() || undefined,
  },
  storage: {
    locale: '@solar-care/locale',
    onboarding: '@solar-care/onboarding',
  },
} as const;
