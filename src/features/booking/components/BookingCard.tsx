import { ArrowRight, MapPin, SolarPanel } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Divider } from '@/components/layout/Containers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { BookingCardData } from '@/types/booking';

import { displayAmount } from '../utils/bookingPrice';
import { formatBookingDate } from '../utils/bookingDate';
import { BookingStatusBadge } from './BookingStatusBadge';

export function BookingCard({ booking, onPress }: { booking: BookingCardData; onPress: () => void }) {
  const { t, i18n } = useTranslation();

  return (
    <Entrance variant="fade">
      <AppCard onPress={onPress}>
        <View style={styles.header}>
          <View style={styles.icon}><SolarPanel color={colors.deep} size={sizes.icon.md} /></View>
          <View style={styles.copy}>
            <Text style={[typography.label, styles.reference]}>{booking.reference}</Text>
            <Text style={[typography.section, styles.title]}>{booking.serviceName}</Text>
            <Text style={[typography.metadata, styles.muted]}>{formatBookingDate(booking.serviceDate, i18n.resolvedLanguage)}</Text>
            <Text style={[typography.metadata, styles.muted]}>
              {t('booking.details.submittedAt')} · {formatBookingDate(booking.createdAt, i18n.resolvedLanguage)}
            </Text>
          </View>
        </View>
        <BookingStatusBadge status={booking.status} animated={false} />
        <View style={styles.address}>
          <MapPin color={colors.muted} size={sizes.icon.sm} />
          <View style={styles.copy}>
            <Text numberOfLines={2} style={[typography.supporting, styles.title]}>{booking.addressSummary}</Text>
            {booking.estimatedAmount !== null && <Text style={[typography.metadata, styles.muted]}>
              {displayAmount(booking.estimatedAmount, booking.currency)}
            </Text>}
          </View>
        </View>
        <Divider />
        <View style={styles.footer}>
          <Text style={[typography.button, styles.link]}>{t('booking.history.viewDetails')}</Text>
          <ArrowRight color={colors.deep} size={sizes.icon.md} />
        </View>
      </AppCard>
    </Entrance>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  icon: {
    width: sizes.touchTarget, height: sizes.touchTarget, borderRadius: radius.md, backgroundColor: colors.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  copy: { flex: 1, gap: spacing.xxs },
  reference: { color: colors.deep },
  title: { color: colors.ink },
  muted: { color: colors.muted },
  address: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  link: { color: colors.deep, flexShrink: 1 },
});
