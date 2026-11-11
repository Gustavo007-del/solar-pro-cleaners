import { LocateFixed, MapPin, MapPinned, Pencil, RefreshCw } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, PrimaryButton, SecondaryButton, TextButton } from '@/components/buttons/Buttons';
import { Divider } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { StatusBadge } from '@/components/surfaces/StatusBadge';
import type { CapturedLocation, LocationFailure } from '@/services/location/currentLocation';
import { openCoordinatesInMaps } from '@/services/location/mapsLink';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { BookingLocation } from '@/types/booking';

import { formatCoordinates } from '../utils/coordinates';

type Props = {
  captured: CapturedLocation | null;
  selected: BookingLocation | null;
  confirmed: boolean;
  capturing: boolean;
  failure?: LocationFailure;
  disabled: boolean;
  editor?: ReactNode;
  onCapture: () => void;
  onEdit: () => void;
  onConfirm: () => void;
};

export function LocationCard({ captured, selected, confirmed, capturing, failure, disabled, editor, onCapture, onEdit, onConfirm }: Props) {
  const { t } = useTranslation();
  const [linkError, setLinkError] = useState<'maps' | 'settings'>();
  const canOpenSettings = failure === 'permissionDenied' || failure === 'permissionBlocked' || failure === 'servicesDisabled';

  async function openSettings() {
    setLinkError(undefined);
    try {
      if (Platform.OS === 'android' && failure === 'servicesDisabled') {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      } else {
        await Linking.openSettings();
      }
    } catch {
      setLinkError('settings');
    }
  }

  async function openMap() {
    if (!captured) return;
    setLinkError(undefined);
    if ((await openCoordinatesInMaps(captured.coordinates)) !== 'opened') setLinkError('maps');
  }

  const address = selected?.address ?? captured?.address;

  return (
    <AppCard elevated style={styles.card}>
      <SectionHeader
        title={t('booking.location.title')}
        subtitle={t('booking.location.description')}
        action={<MapPin size={sizes.icon.lg} color={colors.deep} />}
      />

      {!captured && !editor && (
        <PrimaryButton
          label={t('booking.location.useCurrent')}
          icon={LocateFixed}
          loading={capturing}
          loadingLabel={t('booking.location.getting')}
          disabled={disabled}
          fullWidth
          onPress={onCapture}
        />
      )}

      {failure && (
        <View style={styles.notice}>
          <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>
            {t(`booking.location.failure.${failure}`)}
          </Text>
          {canOpenSettings && (
            <TextButton label={t('booking.location.settings')} compact disabled={disabled} onPress={() => { void openSettings(); }} />
          )}
        </View>
      )}

      {(captured || selected) && (
        <Entrance key={confirmed ? 'confirmed' : 'selected'} variant="fade" style={styles.preview}>
          <StatusBadge
            tone={captured || confirmed ? 'success' : 'neutral'}
            label={t(confirmed ? 'booking.location.confirmed' : captured ? 'booking.location.detected' : 'booking.location.manual')}
          />
          {address && <Text style={[typography.body, styles.address]}>{address.formattedAddress}</Text>}
          {captured && (
            <>
              <Text style={[typography.supporting, styles.coordinates]}>
                {t('booking.location.coordinateLabel', { value: formatCoordinates(captured.coordinates) })}
              </Text>
              {!address && <Text style={[typography.supporting, styles.coordinates]}>{t('booking.location.noAddress')}</Text>}
              <TextButton
                label={t('booking.location.openMaps')}
                icon={MapPinned}
                compact
                disabled={disabled}
                onPress={() => { void openMap(); }}
              />
            </>
          )}
        </Entrance>
      )}

      {linkError && (
        <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>
          {t(linkError === 'maps' ? 'booking.location.mapsError' : 'booking.location.settingsError')}
        </Text>
      )}

      {editor ? (
        <Entrance style={styles.editor}><Divider />{editor}</Entrance>
      ) : (
        <View style={styles.actions}>
          <OutlineButton
            label={t(captured || selected ? 'booking.location.editAddress' : 'booking.location.enterAddress')}
            icon={Pencil}
            compact
            disabled={disabled}
            onPress={onEdit}
          />
          {captured && (
            <OutlineButton
              label={t('booking.location.refresh')}
              icon={RefreshCw}
              compact
              loading={capturing}
              loadingLabel={t('booking.location.getting')}
              disabled={disabled}
              onPress={onCapture}
            />
          )}
        </View>
      )}

      {selected && !confirmed && (
        <SecondaryButton label={t('booking.location.confirm')} fullWidth disabled={disabled || capturing} onPress={onConfirm} />
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.outline, gap: spacing.md },
  notice: { gap: spacing.xxs },
  preview: { gap: spacing.xs, borderRadius: radius.lg, padding: spacing.md, backgroundColor: colors.mint },
  address: { color: colors.ink },
  coordinates: { color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  editor: { gap: spacing.md },
  error: { color: colors.error },
});
