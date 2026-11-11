import { appEnvironment, getPublicApiBaseUrl } from './environment';

export const appConfig = {
  environment: appEnvironment,
  api: {
    baseUrl: getPublicApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
  },
  business: {
    name: process.env.EXPO_PUBLIC_BUSINESS_NAME?.trim() || undefined,
    legalName: process.env.EXPO_PUBLIC_BUSINESS_LEGAL_NAME?.trim() || undefined,
    phone: process.env.EXPO_PUBLIC_BUSINESS_PHONE?.trim() || undefined,
    whatsapp: process.env.EXPO_PUBLIC_BUSINESS_WHATSAPP?.trim() || undefined,
    email: process.env.EXPO_PUBLIC_BUSINESS_EMAIL?.trim() || undefined,
    address: process.env.EXPO_PUBLIC_BUSINESS_ADDRESS?.trim() || undefined,
    hours: process.env.EXPO_PUBLIC_BUSINESS_HOURS?.trim() || undefined,
    website: process.env.EXPO_PUBLIC_BUSINESS_WEBSITE?.trim() || undefined,
    privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || undefined,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL?.trim() || undefined,
    deletionUrl: process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL?.trim() || undefined,
  },
  storage: {
    locale: '@solar-care/locale',
    onboarding: '@solar-care/onboarding',
    customerProfile: '@solar-care/customer-profile',
    bookingPrefix: '@solar-care/bookings/',
  },
} as const;
