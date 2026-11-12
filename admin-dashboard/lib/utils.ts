import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...values: ClassValue[]) { return twMerge(clsx(values)); }

export function label(value?: string | null) {
  return value ? value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) : '—';
}

export function dateText(value?: string | null, timezone = 'Asia/Kolkata') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: value.length === 10 ? 'UTC' : timezone,
  }).format(date);
}

export function dayInZone(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts();
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)?.value).join('-');
}

export function timestamp(value?: string | null, timezone = 'Asia/Kolkata') {
  if (!value || Number.isNaN(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value));
}

export function money(value?: string | null, currency?: string) {
  return value != null ? [currency, value].filter(Boolean).join(' ') : '—';
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('');
}

export function mapsLink(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'www.google.com' && url.pathname.startsWith('/maps/')) return url.href;
  } catch { /* Ignore malformed URLs. */ }
  return undefined;
}

