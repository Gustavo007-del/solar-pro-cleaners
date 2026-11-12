import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { BookingErrorState, BookingLoadingState } from '@/features/booking/components/BookingFeedback';
import { useBookingResource } from '@/features/booking/hooks/useBookingResource';
import { useApiMessage } from '@/hooks/useApiMessage';
import { catalogue } from '@/services/api/catalogue';
import { spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

import { ServicePricing } from '../components/ServicePricing';

export function ServiceDetailsScreen() {
  const { t } = useTranslation();
  const message = useApiMessage();
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const valid = z.uuid().safeParse(serviceId).success;
  const read = useCallback(() => catalogue.service(serviceId ?? ''), [serviceId]);
  const { data, loading, error, refresh } = useBookingResource(valid ? serviceId : undefined, read);
  return (
    <ScreenContainer>
      <AppHeader title={t('integration.services')} onBack={() => backOrReplace(appRoutes.home)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {loading ? <BookingLoadingState /> : data && !error ? <>
          <AppCard>
            <SectionHeader title={data.name} subtitle={data.description} />
            {data.benefits.map((benefit, index) => <Text key={index} style={typography.body}>{benefit}</Text>)}
          </AppCard>
          <AppCard><SectionHeader title={t('integration.price')} /><ServicePricing pricing={data.pricing} /></AppCard>
          <PrimaryButton label={t('nav.booking')} onPress={() => router.push({ pathname: appRoutes.booking, params: { serviceId } })} />
        </> : <BookingErrorState title={t('error.title')} description={message(error, t('integration.noServices'))}
          onRetry={valid ? refresh : undefined} />}
      </ScrollContainer>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({ content: { gap: spacing.md } });

