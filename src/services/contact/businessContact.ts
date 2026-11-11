import { appConfig } from '@/constants/config';

import { getWebUrl, normalizeInternationalPhone, openExternalLink, openPhoneDialer } from './externalLinks';

const { phone, whatsapp, website, privacyUrl, termsUrl, deletionUrl, ...details } = appConfig.business;
const businessPhone = normalizeInternationalPhone(phone);
const whatsappPhone = normalizeInternationalPhone(whatsapp ?? phone);
const whatsappLink = whatsappPhone ? `https://wa.me/${whatsappPhone.slice(1)}` : undefined;

export const businessContact = {
  ...details,
  phone: businessPhone,
  whatsapp: whatsappPhone,
  website: getWebUrl(website),
  privacyUrl: getWebUrl(privacyUrl),
  termsUrl: getWebUrl(termsUrl),
  deletionUrl: getWebUrl(deletionUrl),
};

export type BusinessContactAction = 'call' | 'whatsapp';

export function openBusinessContact(action: BusinessContactAction) {
  return action === 'call' ? openPhoneDialer(businessPhone) : openExternalLink(whatsappLink);
}
