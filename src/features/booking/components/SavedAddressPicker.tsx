import { useCallback } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, TextButton } from '@/components/buttons/Buttons';
import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { useApiMessage } from '@/hooks/useApiMessage';
import { usePagedResource } from '@/hooks/usePagedResource';
import { useSaveAction } from '@/hooks/useSaveAction';
import { addresses, type SavedAddress, type SavedAddressListItem } from '@/services/api/addresses';
import { typography } from '@/theme';

export function SavedAddressPicker({ selected, disabled, onSelect }: {
  selected?: string; disabled: boolean; onSelect: (address: SavedAddress) => void;
}) {
  const { t } = useTranslation();
  const message = useApiMessage();
  const read = useCallback((page: number) => addresses.list(page), []);
  const { data, loading, error, more, refresh, loadMore } = usePagedResource<SavedAddressListItem, Awaited<ReturnType<typeof addresses.list>>>(read);
  const selection = useSaveAction();
  return (
    <AppCard>
      <SectionHeader title={t('integration.savedAddresses')} />
      {loading && !data && <Text style={typography.supporting}>{t('common.loading')}</Text>}
      {data?.items.length === 0 && <Text style={typography.supporting}>{t('integration.noAddresses')}</Text>}
      {data?.items.map((address) => <OutlineButton key={address.id} compact
        label={`${address.label ?? address.address_line}${address.is_default ? ` · ${t('integration.defaultAddress')}` : ''}`}
        disabled={disabled || selection.pending || selected === address.id}
        onPress={() => { void selection.save(async () => onSelect(await addresses.read(address.id))); }} />)}
      {data?.hasNext && <TextButton label={t('integration.loadMore')} disabled={disabled || more} onPress={() => { void loadMore(); }} />}
      {(error != null || selection.failed) && <Text style={typography.supporting}>{message(error ?? selection.error, t('error.description'))}</Text>}
      {error != null && <TextButton label={t('common.retry')} disabled={disabled} onPress={() => { void (data ? loadMore() : refresh()); }} />}
    </AppCard>
  );
}

