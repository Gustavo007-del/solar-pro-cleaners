export function formatBookingDate(value: string, locale: string | undefined, includeTime = false) {
  const date = new Date(value);
  if (!includeTime) return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);

  const { hourCycle } = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hourCycle }).format(date);
}
