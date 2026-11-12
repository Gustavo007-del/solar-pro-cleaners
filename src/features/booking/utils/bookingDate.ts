import { z } from 'zod';

export function parseBookingDate(value: string) {
  const text = value.trim();
  const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const iso = parts ? `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : text;
  const result = z.iso.date().safeParse(iso);
  return result.success && !iso.startsWith('0000-') ? result.data : undefined;
}

export function formatBookingDate(value: string, locale: string | undefined, includeTime = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  }
  const date = new Date(value);
  if (!includeTime) return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);

  const { hourCycle } = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', hourCycle }).format(date);
}
