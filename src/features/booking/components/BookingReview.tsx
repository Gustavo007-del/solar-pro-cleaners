import { ClipboardCheck } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCheckbox } from '@/components/forms/Selection';
import { Divider } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, sizes, typography } from '@/theme';
import type { BookingLocation } from '@/types/booking';
import type { CustomerProfile } from '@/types/customerProfile';

import { formatCoordinates } from '../utils/coordinates';
import { DetailRows } from '@/components/layout/DetailRows';

export function BookingReview({ profile, serviceName, serviceDate, location, instructions, checked, disabled, onCheck }: {
  profile: CustomerProfile;
  serviceName?: string;
  serviceDate: string;
  location: BookingLocation | null;
  instructions: string;
  checked: boolean;
  disabled: boolean;
  onCheck: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows = [
    ...(serviceName ? [{ label: t('booking.summary.service'), value: serviceName }] : []),
    ...(serviceDate ? [{ label: t('integration.requestedDate'), value: serviceDate }] : []),
    { label: t('booking.customer.name'), value: profile.fullName },
    { label: t('booking.customer.primaryPhone'), value: profile.primaryPhone },
  ];
  if (location) {
    rows.push({ label: t('booking.summary.address'), value: location.address.formattedAddress });
    if (location.coordinates) {
      rows.push({ label: t('booking.summary.coordinates'), value: formatCoordinates(location.coordinates) });
    }
    rows.push({
      label: t('booking.summary.method'),
      value: t(location.isAddressManuallyEdited ? 'booking.summary.editedGps'
        : location.method === 'gps' ? 'booking.summary.gps' : 'booking.summary.manual'),
    });
  }
  if (instructions.trim()) rows.push({ label: t('booking.instructions.title'), value: instructions.trim() });

  return (
    <AppCard>
      <SectionHeader title={t('booking.summary.title')} action={<ClipboardCheck size={sizes.icon.md} color={colors.deep} />} />
      <DetailRows rows={rows} />
      {!location && <Text style={[typography.supporting, styles.note]}>{t('booking.summary.locationRequired')}</Text>}
      <Divider />
      <AppCheckbox label={t('booking.summary.confirmDetails')} checked={checked} disabled={disabled} onValueChange={onCheck} />
    </AppCard>
  );
}

const styles = StyleSheet.create({ note: { color: colors.muted } });
