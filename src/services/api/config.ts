import { appConfig } from '@/constants/config';

export type ApiPath = `/${string}`;

export function resolveApiUrl(path: ApiPath): string {
  if (!appConfig.api.baseUrl) {
    throw new Error('EXPO_PUBLIC_API_BASE_URL must be configured before using the API.');
  }

  return `${appConfig.api.baseUrl}${path}`;
}
