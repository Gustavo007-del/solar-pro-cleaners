export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48 } as const;

export const sizes = {
  screenMargin: spacing.lg,
  screenMaxWidth: 640,
  touchTarget: 48,
  icon: { sm: 16, md: 20, lg: 24, xl: 36 },
  button: { compact: 48, standard: 54 },
  input: 56,
  textArea: 124,
  tabIndicator: { width: 48, height: 32 },
  header: 56,
  heroIcon: 68,
  heroMinHeight: 234,
  splashMark: 96,
  onboardingArtMaxWidth: 440,
  languageCard: 80,
  benefitsGridMinWidth: 346,
  bookingEmptyArtMaxWidth: 220,
} as const;
