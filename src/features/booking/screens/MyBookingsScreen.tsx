import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenContainer } from '@/components/layout/Containers';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { bookingService, getBookingsByStatus, getBookingStatistics } from '@/services/bookings/bookingService';
import { colors, sizes, spacing, typography } from '@/theme';
import type { Booking, BookingFilter } from '@/types/booking';

import { BookingCard } from '../components/BookingCard';
import { BookingEmptyState, BookingErrorState, BookingLoadingState } from '../components/BookingFeedback';
import { BookingFilters } from '../components/BookingFilters';
import { BookingStatusSummary } from '../components/BookingStatusSummary';
import { useBookingResource } from '../hooks/useBookingResource';

const emptyBookings: readonly Booking[] = [];

export function MyBookingsScreen() {
  const { profile } = useApplication();
  return <BookingHistory key={profile?.customerId} customerId={profile?.customerId} />;
}

function BookingHistory({ customerId }: { customerId?: string }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<BookingFilter>('all');
  const read = useCallback(() => customerId ? bookingService.getCustomerBookings(customerId) : Promise.resolve(emptyBookings), [customerId]);
  const { data, loading, failed, refresh } = useBookingResource(customerId, read);
  const bookings = data ?? emptyBookings;
  const counts = useMemo(() => getBookingStatistics(bookings), [bookings]);
  const filtered = useMemo(() => getBookingsByStatus(bookings, filter), [bookings, filter]);

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <FlatList
        data={filtered}
        keyExtractor={(booking) => booking.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={BookingGap}
        onRefresh={data ? refresh : undefined}
        refreshing={Boolean(data) && loading}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.intro}>
              <Text accessibilityRole="header" style={[typography.heading, styles.title]}>{t('nav.bookings')}</Text>
              <Text style={[typography.supporting, styles.description]}>{t('booking.history.description')}</Text>
            </View>
            {data && (
              <>
                <BookingStatusSummary counts={counts} />
                <BookingFilters selected={filter} onChange={setFilter} />
              </>
            )}
            {failed && data && (
              <BookingErrorState title={t('booking.history.readErrorTitle')} description={t('booking.history.refreshError')} onRetry={refresh} />
            )}
          </View>
        }
        ListEmptyComponent={
          !customerId ? (
            <BookingErrorState title={t('booking.history.readErrorTitle')} description={t('booking.history.profileMissing')} />
          ) : failed ? (
            data ? null : <BookingErrorState title={t('booking.history.readErrorTitle')} description={t('booking.history.readError')} onRetry={refresh} />
          ) : loading && !data ? (
            <BookingLoadingState />
          ) : (
            <BookingEmptyState
              filter={filter}
              onBook={() => router.navigate(appRoutes.booking)}
              onReset={() => setFilter('all')}
            />
          )
        }
        renderItem={({ item }) => (
          <BookingCard booking={item} onPress={() => router.push({ pathname: appRoutes.bookingDetails, params: { bookingId: item.id } })} />
        )}
      />
    </ScreenContainer>
  );
}

function BookingGap() {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: sizes.screenMargin, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  intro: { gap: spacing.xxs },
  title: { color: colors.ink },
  description: { color: colors.muted },
  gap: { height: spacing.sm },
});
