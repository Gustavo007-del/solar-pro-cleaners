import { ChevronDown, ChevronUp, MapPin, MapPinned } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton } from '@/components/buttons/Buttons';
import { Divider } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { openCoordinatesInMaps } from '@/services/location/mapsLink';
import { colors, sizes, spacing, typography } from '@/theme';
import type { BookingLocation } from '@/types/booking';

import { formatCoordinates } from '../utils/coordinates';
import { DetailRows } from '@/components/layout/DetailRows';

const fields = ['houseName', 'locality', 'city', 'district', 'state', 'pinCode', 'landmark'] as const;

export function BookingLocationDetails({ location }: { location: BookingLocation }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { address, coordinates } = location;
  const rows = fields.flatMap((field) => {
    const value = address[field];
    return value ? [{ label: t(`booking.details.addressFields.${field}`), value }] : [];
  });
  const Chevron = expanded ? ChevronUp : ChevronDown;

  async function openMap() {
    if (!coordinates) return;
    setFailed(false);
    if ((await openCoordinatesInMaps(coordinates)) !== 'opened') setFailed(true);
  }

  return (
    <AppCard>
      <SectionHeader title={t('booking.details.location')} action={<MapPin size={sizes.icon.md} color={colors.deep} />} />
      <Text selectable style={[typography.body, styles.address]}>{address.formattedAddress || t('booking.form.gpsAdded')}</Text>
      {rows.length > 0 && <><Divider /><DetailRows rows={rows} /></>}
      {coordinates && (
        <View style={styles.actions}>
          <Divider />
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={styles.disclosure}
          >
            <Text style={[typography.label, styles.disclosureText]}>{t('booking.summary.coordinates')}</Text>
            <Chevron size={sizes.icon.md} color={colors.deep} />
          </AnimatedPressable>
          {expanded && (
            <Entrance variant="fade">
              <Text selectable style={[typography.supporting, styles.address]}>{formatCoordinates(coordinates)}</Text>
            </Entrance>
          )}
          <OutlineButton compact icon={MapPinned} label={t('booking.location.openMaps')} onPress={() => { void openMap(); }} />
          {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('booking.location.mapsError')}</Text>}
        </View>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  address: { color: colors.ink },
  actions: { gap: spacing.xs },
  disclosure: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: sizes.touchTarget },
  disclosureText: { color: colors.deep, flexShrink: 1 },
  error: { color: colors.error },
});
