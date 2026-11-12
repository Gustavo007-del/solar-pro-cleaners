import { router } from 'expo-router';
import { SolarPanel } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TextButton } from '@/components/buttons/Buttons';
import { SectionHeader } from '@/components/layout/Headers';
import { ServiceCard } from '@/components/surfaces/ContentCards';
import { appRoutes } from '@/constants/routes';
import { BookingErrorState, BookingLoadingState } from '@/features/booking/components/BookingFeedback';
import { useApiMessage } from '@/hooks/useApiMessage';
import { usePagedResource } from '@/hooks/usePagedResource';
import { catalogue, type Service } from '@/services/api/catalogue';
import { spacing, typography } from '@/theme';

type ServicePage = Awaited<ReturnType<typeof catalogue.services>>;
export function ServiceCatalogue({ onSelect, selectedId, renderFeatured }: {
  onSelect?: (id: string) => void; selectedId?: string; renderFeatured?: (service: Service) => ReactNode;
}) {
  const { t } = useTranslation();
  const message = useApiMessage();
  const { data, error, loading, more, refresh, loadMore } = usePagedResource<Service, ServicePage>(catalogue.services);
  return (
    <View style={styles.content}>
      <SectionHeader title={t('integration.services')} />
      {loading && !data && <BookingLoadingState />}
      {error != null && <BookingErrorState title={t('error.title')} description={message(error, t('error.description'))}
        onRetry={data ? loadMore : refresh} />}
      {data?.items.length === 0 && <Text style={typography.supporting}>{t('integration.noServices')}</Text>}
      {data?.items.map((service) => (
        <ServiceCard key={service.id} icon={SolarPanel} title={service.name} description={service.short_description} footer={
          <TextButton compact label={t(onSelect ? 'nav.booking' : 'integration.viewService')}
            disabled={selectedId === service.id}
            onPress={() => onSelect ? onSelect(service.id)
              : router.push({ pathname: appRoutes.serviceDetails, params: { serviceId: service.id } })} />
        } />
      ))}
      {data?.hasNext && <TextButton label={t('integration.loadMore')} disabled={more} onPress={() => { void loadMore(); }} />}
      {data?.items[0] && renderFeatured?.(data.items[0])}
    </View>
  );
}
const styles = StyleSheet.create({ content: { gap: spacing.sm } });

