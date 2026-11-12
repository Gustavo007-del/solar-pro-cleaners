import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, PrimaryButton, TextButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApiMessage } from '@/hooks/useApiMessage';
import { usePagedResource } from '@/hooks/usePagedResource';
import { useSaveAction } from '@/hooks/useSaveAction';
import { addresses, fromAddress, type SavedAddress, type SavedAddressListItem } from '@/services/api/addresses';
import { colors, spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';
import type { BookingLocation } from '@/types/booking';

import { BookingErrorState, BookingLoadingState } from '../components/BookingFeedback';
import { ManualAddressForm } from '../components/ManualAddressForm';
import { useLocationCapture } from '../hooks/useLocationCapture';
import { addressToForm } from '../schemas/addressSchema';

type AddressPage = Awaited<ReturnType<typeof addresses.list>>;

export function SavedAddressesScreen() {
  const { t } = useTranslation();
  const { add } = useLocalSearchParams<{ add?: string }>();
  const [editor, setEditor] = useState<SavedAddress | 'new' | null>(add === '1' ? 'new' : null);
  const { data, error, loading, more, refresh, loadMore } = usePagedResource<SavedAddressListItem, AddressPage>(addresses.list);
  const mutation = useSaveAction();
  const message = useApiMessage();

  function remove(id: string) {
    Alert.alert(t('integration.deleteAddress'), t('integration.deleteAddressConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('integration.deleteAddress'), style: 'destructive', onPress: () => {
        void mutation.save(async () => { await addresses.remove(id); await refresh(); });
      } },
    ]);
  }

  return (
    <ScreenContainer>
      <AppHeader title={t('integration.savedAddresses')} onBack={() => backOrReplace(appRoutes.settings)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {editor && <AddressEditor key={editor === 'new' ? 'new' : editor.id} existing={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void refresh(); }} />}
        {!editor && <PrimaryButton label={t('integration.addAddress')} onPress={() => setEditor('new')} />}
        {mutation.failed && <Text style={styles.error}>{message(mutation.error, t('error.save'))}</Text>}
        {loading && !data && <BookingLoadingState />}
        {error != null && <BookingErrorState title={t('error.title')} description={message(error, t('error.description'))}
          onRetry={data ? loadMore : refresh} />}
        {data?.items.length === 0 && <Text style={typography.supporting}>{t('integration.noAddresses')}</Text>}
        {data?.items.map((item) => (
          <AppCard key={item.id}>
            <SectionHeader title={item.label ?? item.address_line}
              subtitle={item.label ? item.address_line : undefined} />
            {item.is_default && <Text style={typography.supporting}>{t('integration.defaultAddress')}</Text>}
            <View style={styles.actions}>
              <OutlineButton compact label={t('integration.editAddress')} disabled={mutation.pending}
                onPress={() => { void mutation.save(async () => setEditor(await addresses.read(item.id))); }} />
              {!item.is_default && <TextButton compact label={t('integration.setDefault')} disabled={mutation.pending}
                onPress={() => { void mutation.save(async () => { await addresses.makeDefault(item.id); await refresh(); }); }} />}
              <TextButton compact label={t('integration.deleteAddress')} disabled={mutation.pending} onPress={() => remove(item.id)} />
            </View>
          </AppCard>
        ))}
        {data?.hasNext && <TextButton label={t('integration.loadMore')} disabled={more} onPress={() => { void loadMore(); }} />}
      </ScrollContainer>
    </ScreenContainer>
  );
}

function AddressEditor({ existing, onClose, onSaved }: { existing?: SavedAddress; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const message = useApiMessage();
  const { pending, error, save } = useSaveAction();
  const [location, setLocation] = useState<BookingLocation | undefined>(() => existing ? fromAddress(existing) : undefined);
  const [revision, setRevision] = useState(0);
  const gps = useLocationCapture();

  return (
    <AppCard>
      <OutlineButton label={t('booking.location.useCurrent')} loading={gps.loading} disabled={pending}
        onPress={() => { void gps.capture((captured) => {
          setLocation({ method: 'gps', coordinates: captured.coordinates,
            address: captured.address ?? { formattedAddress: '', houseName: null, locality: null, city: null,
              district: null, state: null, pinCode: null, landmark: null },
            isAddressManuallyEdited: true });
          setRevision((value) => value + 1);
        }); }} />
      {gps.failure && <Text style={styles.error}>{t(`booking.location.failure.${gps.failure}`)}</Text>}
      <ManualAddressForm key={revision} defaults={addressToForm(location?.address)} disabled={pending || gps.loading}
        onChange={() => {}} onCancel={onClose}
        onSave={(address) => { void save(async () => {
          const next: BookingLocation = location?.method === 'gps'
            ? { ...location, address, isAddressManuallyEdited: true }
            : { method: 'manual', address, coordinates: null, isAddressManuallyEdited: false };
          if (existing) await addresses.update(existing.id, next);
          else await addresses.create(next);
          onSaved();
        }); }} />
      {error != null && <Text style={styles.error}>{message(error, t('error.save'))}</Text>}
    </AppCard>
  );
}
const styles = StyleSheet.create({
  content: { gap: spacing.md }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  error: { ...typography.supporting, color: colors.error },
});

