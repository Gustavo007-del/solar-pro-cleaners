import { router, useLocalSearchParams } from 'expo-router';
import { Phone } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApiMessage } from '@/hooks/useApiMessage';
import { useSaveAction } from '@/hooks/useSaveAction';
import { ServicePricing } from '@/features/home/components/ServicePricing';
import { useApplication } from '@/providers/ApplicationProvider';
import { bookingService } from '@/services/bookings/bookingService';
import { normalizeInternationalPhone, openPhoneDialer } from '@/services/contact/externalLinks';
import { colors, spacing, typography } from '@/theme';
import type { Booking } from '@/types/booking';

import { DetailRows } from '@/components/layout/DetailRows';
import { BookingErrorState, BookingLoadingState } from '../components/BookingFeedback';
import { BookingLocationDetails } from '../components/BookingLocationDetails';
import { BookingProgressTimeline } from '../components/BookingProgressTimeline';
import { displayAmount } from '../utils/bookingPrice';
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
  const message = useApiMessage();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const id = typeof bookingId === 'string' ? bookingId : undefined;
  const customerId = profile?.customerId;
  const scope = customerId && id ? `${customerId}/${id}` : undefined;
  const read = useCallback(() => customerId && id ? bookingService.getBookingById(id) : Promise.resolve(undefined), [customerId, id]);
  const { data, failed, error, loading, refresh } = useBookingResource(scope, read);

  return (
    <ScreenContainer>
      <AppHeader title={t('nav.bookingDetails')} onBack={goBack} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {failed ? (
          <BookingErrorState
            title={t('booking.success.unavailable')}
            description={message(error, t('booking.success.readError'))}
            onRetry={refresh}
            onBack={openBookings}
          />
        ) : loading ? (
          <BookingLoadingState />
        ) : data ? (
          <BookingDetails key={scope} booking={data} onChange={refresh} />
        ) : (
          <BookingErrorState title={t('booking.success.unavailable')} description={t('booking.success.notFound')} onBack={openBookings} />
        )}
      </ScrollContainer>
    </ScreenContainer>
  );
}

function BookingDetails({ booking, onChange }: { booking: Booking; onChange: () => void }) {
  const { t, i18n } = useTranslation();
  const message = useApiMessage();
  const cancellation = useSaveAction();
  const [cancelled, setCancelled] = useState<Booking>();

  function requestCancellation() {
    Alert.alert(t('integration.cancel'), t('integration.cancelConfirm'), [
      { text: t('integration.keep'), style: 'cancel' },
      { text: t('integration.cancel'), style: 'destructive', onPress: () => {
        void cancellation.save(async () => {
          setCancelled(await bookingService.cancel(booking.id));
          onChange();
        });
      } },
    ]);
  }

  const [callFailed, setCallFailed] = useState(false);
  const technician = cancelled ? null : booking.technician;
  const technicianPhone = normalizeInternationalPhone(technician?.phone);
  const showTechnician = !cancelled && booking.status !== 'cancelled' && booking.status !== 'completed';
  const technicianAssigned = booking.status === 'assigned' || booking.status === 'in_progress';
  const milestones = [
    { label: t('booking.details.submittedAt'), date: booking.createdAt },
    { label: t('booking.details.confirmedAt'), date: booking.confirmedAt },
    { label: t('booking.details.assignedAt'), date: booking.assignedAt },
    { label: t('booking.details.startedAt'), date: booking.startedAt },
    { label: t('booking.details.completedAt'), date: booking.completedAt },
    { label: t('integration.cancelledAt'), date: cancelled?.cancelledAt ?? booking.cancelledAt },
  ];

  async function callTechnician() {
    setCallFailed(false);
    if ((await openPhoneDialer(technicianPhone)) !== 'opened') setCallFailed(true);
  }

  return (
    <>
      <Entrance>
        <AppCard elevated>
          <Text style={[typography.metadata, styles.muted]}>{t('booking.success.reference')}</Text>
          <Text selectable style={[typography.heading, styles.reference]}>{booking.reference}</Text>
          <Text style={[typography.section, styles.title]}>{booking.serviceName}</Text>
          <Text style={[typography.supporting, styles.muted]}>{formatBookingDate(booking.createdAt, i18n.resolvedLanguage)}</Text>
          <BookingStatusBadge status={cancelled?.status ?? booking.status} />
        </AppCard>
      </Entrance>

      <BookingProgressTimeline status={cancelled?.status ?? booking.status} history={cancelled?.history ?? booking.history} />
      <View style={styles.group}>
        <SectionHeader title={t('booking.details.service')} />
        <AppCard><DetailRows rows={[
          { label: t('booking.summary.service'), value: booking.serviceName },
          { label: t('integration.requestedDate'), value: booking.serviceDate
            ? formatBookingDate(booking.serviceDate, i18n.resolvedLanguage) : t('booking.form.datePending') },
          { label: t('integration.estimate'), value: booking.estimatedAmount !== null
            ? displayAmount(booking.estimatedAmount, booking.currency)
            : t(booking.pricing.pricing_type === 'custom_quote' ? 'integration.quote' : 'integration.priceUnknown') },
          ...(booking.pricing.panel_quantity !== null ? [{
            label: t('integration.panelQuantity'), value: String(booking.pricing.panel_quantity),
          }] : []),
        ]} />
          {booking.pricing.pricing_type === 'per_panel' &&
            <ServicePricing pricing={{ ...booking.pricing, pricing_type: 'per_panel' }} />}
        </AppCard>
      </View>
      <CustomerDetailsCard
        details={{ fullName: booking.customerName, primaryPhone: booking.primaryPhone, alternatePhone: booking.alternatePhone }}
      />
      {showTechnician && <AppCard>
        <SectionHeader title={t('booking.details.technician')} />
        {technician ? <>
          <Text style={typography.body}>{technician.fullName}</Text>
          {technicianPhone && <>
            <Text selectable style={typography.body}>{technicianPhone}</Text>
            <OutlineButton compact icon={Phone} label={t('booking.details.call')} onPress={() => { void callTechnician(); }} />
            {callFailed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('home.support.callError')}</Text>}
          </>}
        </> : <Text style={typography.body}>
          {t(technicianAssigned ? 'booking.details.technicianUnavailable' : 'booking.details.technicianPending')}
        </Text>}
      </AppCard>}
      {booking.location ? <BookingLocationDetails location={booking.location} /> : <AppCard>
        <SectionHeader title={t('booking.details.location')} />
        <Text style={typography.body}>{t('booking.form.locationPending')}</Text>
      </AppCard>}
      {booking.additionalInstructions && (
        <AppCard>
          <SectionHeader title={t('booking.instructions.title')} />
          <Text selectable style={[typography.body, styles.title]}>{booking.additionalInstructions}</Text>
        </AppCard>
      )}
      {booking.history.length > 0 && <AppCard>
        <SectionHeader title={t('integration.statusHistory')} />
        {booking.history.map((entry, index) => <View style={styles.group} key={`${entry.createdAt}/${index}`}>
          <BookingStatusBadge status={entry.status} animated={false} />
          <Text style={typography.supporting}>{formatBookingDate(entry.createdAt, i18n.resolvedLanguage, true)}</Text>
        </View>)}
      </AppCard>}
      <AppCard>
        <SectionHeader title={t('booking.details.timestamps')} />
        <DetailRows rows={milestones.flatMap(({ label, date }) => date
          ? [{ label, value: formatBookingDate(date, i18n.resolvedLanguage, true) }] : [])} />
        {booking.cancellationReason && <Text style={typography.supporting}>{booking.cancellationReason}</Text>}
      </AppCard>
      {cancellation.failed && <Text accessibilityLiveRegion="polite" style={styles.error}>
        {message(cancellation.error, t('error.save'))}
      </Text>}
      {booking.status === 'pending' && !cancelled && <OutlineButton label={t('integration.cancel')}
        loading={cancellation.pending} onPress={requestCancellation} />}
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
