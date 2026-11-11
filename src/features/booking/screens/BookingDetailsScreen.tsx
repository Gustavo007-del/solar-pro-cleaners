import { router, useLocalSearchParams } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { bookingService } from '@/services/bookings/bookingService';
import { openPhoneDialer } from '@/services/contact/externalLinks';
import { colors, spacing, typography } from '@/theme';
import type { Booking } from '@/types/booking';

import { DetailRows } from '@/components/layout/DetailRows';
import { BookingErrorState, BookingLoadingState } from '../components/BookingFeedback';
import { BookingLocationDetails } from '../components/BookingLocationDetails';
import { BookingProgressTimeline } from '../components/BookingProgressTimeline';
import { BookingServiceCard } from '../components/BookingServiceCard';
import { BookingStatusBadge } from '../components/BookingStatusBadge';
import { CustomerDetailsCard } from '../components/CustomerDetailsCard';
import { useBookingResource } from '../hooks/useBookingResource';
import { formatBookingDate } from '../utils/bookingDate';

function openBookings() {
  router.dismissTo(appRoutes.myBookings);
}

function goBack() {
  if (router.canGoBack()) router.back();
  else openBookings();
}

export function BookingDetailsScreen() {
  const { t } = useTranslation();
  const { profile } = useApplication();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const id = typeof bookingId === 'string' ? bookingId : undefined;
  const customerId = profile?.customerId;
  const scope = customerId && id ? `${customerId}/${id}` : undefined;
  const read = useCallback(() => customerId && id ? bookingService.getBookingById(customerId, id) : Promise.resolve(undefined), [customerId, id]);
  const { data, failed, loading, refresh } = useBookingResource(scope, read);

  return (
    <ScreenContainer>
      <AppHeader title={t('nav.bookingDetails')} onBack={goBack} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {failed ? (
          <BookingErrorState
            title={t('booking.success.unavailable')}
            description={t('booking.success.readError')}
            onRetry={refresh}
            onBack={openBookings}
          />
        ) : loading ? (
          <BookingLoadingState />
        ) : data ? (
          <BookingDetails key={scope} booking={data} />
        ) : (
          <BookingErrorState title={t('booking.success.unavailable')} description={t('booking.success.notFound')} onBack={openBookings} />
        )}
      </ScrollContainer>
    </ScreenContainer>
  );
}

function BookingDetails({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation();
  const [callFailed, setCallFailed] = useState(false);

  async function callCustomer() {
    setCallFailed(false);
    if ((await openPhoneDialer(booking.primaryPhone)) !== 'opened') setCallFailed(true);
  }

  return (
    <>
      <Entrance>
        <AppCard elevated>
          <Text style={[typography.metadata, styles.muted]}>{t('booking.success.reference')}</Text>
          <Text selectable style={[typography.heading, styles.reference]}>{booking.reference}</Text>
          <Text style={[typography.section, styles.title]}>{t('booking.service.name')}</Text>
          <Text style={[typography.supporting, styles.muted]}>{formatBookingDate(booking.createdAt, i18n.resolvedLanguage)}</Text>
          <BookingStatusBadge status={booking.status} />
        </AppCard>
      </Entrance>

      <BookingProgressTimeline status={booking.status} />
      <View style={styles.group}>
        <SectionHeader title={t('booking.details.service')} />
        <BookingServiceCard />
      </View>
      <CustomerDetailsCard
        details={{ fullName: booking.customerName, primaryPhone: booking.primaryPhone, alternatePhone: booking.alternatePhone }}
        action={(
          <View style={styles.group}>
            <OutlineButton compact icon={Phone} label={t('booking.details.call')} onPress={() => { void callCustomer(); }} />
            {callFailed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('home.support.callError')}</Text>}
          </View>
        )}
      />
      <BookingLocationDetails location={booking.location} />
      {booking.additionalInstructions && (
        <AppCard>
          <SectionHeader title={t('booking.instructions.title')} />
          <Text selectable style={[typography.body, styles.title]}>{booking.additionalInstructions}</Text>
        </AppCard>
      )}
      <AppCard>
        <SectionHeader title={t('booking.details.timestamps')} />
        <DetailRows rows={[{
          label: t('booking.details.submittedAt'),
          value: formatBookingDate(booking.createdAt, i18n.resolvedLanguage, true),
        }]} />
      </AppCard>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.sm },
  group: { gap: spacing.xs },
  reference: { color: colors.deep },
  title: { color: colors.ink },
  muted: { color: colors.muted },
  error: { color: colors.error },
});
