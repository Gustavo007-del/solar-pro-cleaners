import { Linking } from 'react-native';

export type ExternalLinkResult = 'opened' | 'unavailable' | 'failed';

export function normalizeInternationalPhone(value?: string) {
  const compact = value?.replace(/[\s().-]/g, '').replace(/^00/, '+');
  return compact && /^\+[1-9]\d{7,14}$/.test(compact) ? compact : undefined;
}

export function getWebUrl(value?: string) {
  if (!value || /\s/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

export async function openExternalLink(url?: string): Promise<ExternalLinkResult> {
  if (!url) return 'unavailable';
  try {
    await Linking.openURL(url);
    return 'opened';
  } catch {
    return 'failed';
  }
}

export function openPhoneDialer(value?: string) {
  const phone = normalizeInternationalPhone(value);
  return openExternalLink(phone ? `tel:${phone}` : undefined);
}

export async function openWhatsAppChat(value?: string): Promise<ExternalLinkResult> {
  const phone = normalizeInternationalPhone(value)?.slice(1);
  if (!phone) return 'unavailable';
  const result = await openExternalLink(`whatsapp://send?phone=${phone}`);
  return result === 'opened' ? result : openExternalLink(`https://wa.me/${phone}`);
}
