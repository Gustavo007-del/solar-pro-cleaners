import { appConfig } from '@/constants/config';

import { getWebUrl } from './externalLinks';

function publicPage(path: string) {
  const base = appConfig.api.baseUrl;
  return base ? getWebUrl(new URL(path, base).href) : undefined;
}

export const businessContact = {
  legalName: appConfig.business.legalName,
  privacyUrl: getWebUrl(appConfig.business.privacyUrl) ?? publicPage('/privacy-policy'),
  termsUrl: getWebUrl(appConfig.business.termsUrl),
  deletionUrl: getWebUrl(appConfig.business.deletionUrl) ?? publicPage('/delete-account'),
};

export type BusinessContactAction = 'call' | 'whatsapp';
