import { router, useLocalSearchParams } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { LoadingIndicator } from '@/components/motion/LoadingIndicator';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { bookingService, readBookingReceipt } from '@/services/bookings/bookingService';
import { useApiMessage } from '@/hooks/useApiMessage';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { Booking } from '@/types/booking';

import { DetailRows } from '@/components/layout/DetailRows';
import { displayAmount } from '../utils/bookingPrice';
import { formatBookingDate } from '../utils/bookingDate';
import { BookingStatusBadge } from '../components/BookingStatusBadge';

type Receipt = { customerId: string; bookingId: string; booking?: Booking; error?: unknown };

export function BookingSuccessScreen() {
  const { t } = useTranslation();
  const { profile } = useApplication();
  const message = useApiMessage();
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>();
  const customerId = profile?.customerId;
  const [receipt, setReceipt] = useState<Receipt>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!customerId || !bookingId) return;
    let active = true;
    const scope = { customerId, bookingId };
    const cached = readBookingReceipt(customerId, bookingId);
    if (cached) {
      setReceipt({ ...scope, booking: cached });
      return;
    }

    void bookingService.getBookingById(bookingId).then(
      (booking) => { if (active) setReceipt({ ...scope, booking }); },
      (error: unknown) => { if (active) setReceipt({ ...scope, error }); },
    );

    return () => { active = false; };
  }, [customerId, bookingId, attempt]);

  const result = receipt?.customerId === customerId && receipt?.bookingId === bookingId ? receipt : undefined;

  return (
    <ScreenContainer>
      <ScrollContainer contentContainerStyle={styles.content}>
        {result?.booking ? (
          <BookingReceipt booking={result.booking} />
        ) : customerId && bookingId && !result ? (
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
            <LoadingIndicator />
          </View>
        ) : (
          <AppCard>
            <SectionHeader title={t('booking.success.unavailable')} subtitle={result?.error != null
              ? message(result.error, t('booking.success.readError')) : t('booking.success.notFound')} />
            {result?.error != null && (
              <PrimaryButton label={t('common.retry')} onPress={() => { setReceipt(undefined); setAttempt((value) => value + 1); }} />
            )}
            <OutlineButton label={t('booking.success.home')} onPress={() => router.dismissTo(appRoutes.home)} />
          </AppCard>
        )}
      </ScrollContainer>
    </ScreenContainer>
  );
}

function BookingReceipt({ booking }: { booking: Booking }) {
  const { t, i18n } = useTranslation();

  return (
    <>
      <Entrance style={styles.hero}>
        <View style={styles.icon}><CircleCheck color={colors.deep} size={sizes.icon.xl} /></View>
        <Text accessibilityRole="header" style={[typography.heading, styles.title]}>{t('booking.success.title')}</Text>
        <Text style={[typography.body, styles.description]}>{t('booking.success.description')}</Text>
      </Entrance>

      <Entrance variant="fade">
        <AppCard elevated>
          <SectionHeader title={t('booking.success.reference')} />
          <Text selectable style={[typography.section, styles.reference]}>{booking.reference}</Text>
          <DetailRows rows={[
            { label: t('booking.summary.service'), value: booking.serviceName },
            { label: t('integration.requestedDate'), value: booking.serviceDate
              ? formatBookingDate(booking.serviceDate, i18n.resolvedLanguage) : t('booking.form.datePending') },
            { label: t('integration.estimate'), value: booking.estimatedAmount !== null
              ? displayAmount(booking.estimatedAmount, booking.currency) : t('integration.priceUnknown') },
            { label: t('booking.summary.address'), value: booking.location
              ? booking.location.address.formattedAddress || t('booking.form.gpsAdded') : t('booking.form.locationPending') },
          ]} />
          <BookingStatusBadge status={booking.status} />
          {booking.location && booking.coverageMatched !== true && <Text style={typography.supporting}>{t('integration.coverageManual')}</Text>}
        </AppCard>
      </Entrance>

      <View style={styles.actions}>
        <PrimaryButton label={t('booking.success.myBookings')} fullWidth onPress={() => router.dismissTo(appRoutes.myBookings)} />
        <OutlineButton label={t('booking.success.home')} fullWidth onPress={() => router.dismissTo(appRoutes.home)} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', gap: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm },
  icon: {
    width: sizes.splashMark,
    height: sizes.splashMark,
    borderRadius: radius.full,
    backgroundColor: colors.mint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: { color: colors.ink, textAlign: 'center' },
  description: { color: colors.muted, textAlign: 'center' },
  reference: { color: colors.deep },
  actions: { gap: spacing.sm },
});
