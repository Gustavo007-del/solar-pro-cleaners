import { useTranslation } from 'react-i18next';
import { ApiError, apiErrorMessage } from '@/services/api/client';

export function useApiMessage() {
  const { t } = useTranslation();
  return (error: unknown, fallback: string) => {
    if (!(error instanceof ApiError)) return fallback;
    if (error.code === 'network') return t('integration.network');
    if (error.code === 'timeout') return t('integration.timeout');
    if (error.code === 'configuration') return t('integration.configuration');
    if (error.code === 'invalid_response') return t('integration.invalid');
    if (error.status === 401) return t('integration.session');
    if (error.status === 429) return t('integration.rate');
    if (error.status && error.status >= 500) return t('integration.server');
    return apiErrorMessage(error, fallback);
  };
}

