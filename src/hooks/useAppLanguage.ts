import { useApplication } from '@/providers/ApplicationProvider';

export function useAppLanguage() {
  const { locale, setLocale } = useApplication();
  return { locale, setLocale };
}
