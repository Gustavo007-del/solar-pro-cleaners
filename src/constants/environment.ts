import Constants from 'expo-constants';

type AppEnvironment = 'development' | 'preview' | 'production';

const selected: unknown = Constants.expoConfig?.extra?.appEnvironment;
export const appEnvironment: AppEnvironment =
  selected === 'preview' || selected === 'production' ? selected : 'development';

export function getPublicApiBaseUrl(value?: string) {
  const raw = value?.trim();
  if (!raw || /\s/.test(raw)) return undefined;

  try {
    const url = new URL(raw);
    const allowed = url.protocol === 'https:' || (appEnvironment === 'development' && url.protocol === 'http:');
    if (!allowed || !url.hostname || url.username || url.password || url.search || url.hash) return undefined;
    return url.href.replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}
