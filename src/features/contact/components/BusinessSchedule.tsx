import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TextButton } from '@/components/buttons/Buttons';
import { AppTextInput } from '@/components/forms/TextFields';
import { DetailRows } from '@/components/layout/DetailRows';
import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { useBookingResource } from '@/features/booking/hooks/useBookingResource';
import { formatBookingDate } from '@/features/booking/utils/bookingDate';
import { useApiMessage } from '@/hooks/useApiMessage';
import { usePagedResource } from '@/hooks/usePagedResource';
import { useSaveAction } from '@/hooks/useSaveAction';
import { catalogue } from '@/services/api/catalogue';
import { typography } from '@/theme';
import { indianPinCodePattern } from '@/types/booking';

export function BusinessSchedule() {
  const { t, i18n } = useTranslation();
  const message = useApiMessage();
  const hours = useBookingResource('hours', catalogue.hours);
  const closures = usePagedResource<{ closure_date: string }, Awaited<ReturnType<typeof catalogue.closures>>>(catalogue.closures);
  const areas = usePagedResource<{ id: string; name: string }, Awaited<ReturnType<typeof catalogue.areas>>>(catalogue.areas);
  const [pin, setPin] = useState('');
  const [coverage, setCoverage] = useState<{ pin: string; message: string }>();
  const check = useSaveAction();
  const formatDay = (day: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2024, 0, 1 + day)));
  return <>
    <AppCard>
      <SectionHeader title={t('integration.hours')} subtitle={hours.data && !hours.failed ? hours.data.timezone : undefined} />
      {hours.loading && !hours.data && <Text style={typography.supporting}>{t('common.loading')}</Text>}
      {hours.failed && <>
        <Text style={typography.supporting}>{message(hours.error, t('error.description'))}</Text>
        <TextButton label={t('common.retry')} onPress={hours.refresh} />
      </>}
      {hours.data && !hours.failed && <DetailRows rows={hours.data.days.map((day) => ({
        label: formatDay(day.day_of_week),
        value: day.is_open ? `${day.opening_time?.slice(0, 5)}–${day.closing_time?.slice(0, 5)}` : t('integration.closed'),
      }))} />}
      <SectionHeader title={t('integration.closures')} />
      {closures.loading && !closures.data && <Text style={typography.supporting}>{t('common.loading')}</Text>}
      {closures.error != null && <TextButton label={t('common.retry')} onPress={() => { void (closures.data ? closures.loadMore() : closures.refresh()); }} />}
      {closures.data?.items.map((item) => <Text key={item.closure_date} style={typography.supporting}>
        {formatBookingDate(item.closure_date, i18n.resolvedLanguage)}
      </Text>)}
      {closures.data?.hasNext && <TextButton label={t('integration.loadMore')} disabled={closures.more} onPress={() => { void closures.loadMore(); }} />}
    </AppCard>
    <AppCard>
      <SectionHeader title={t('integration.areas')} />
      {areas.loading && !areas.data && <Text style={typography.supporting}>{t('common.loading')}</Text>}
      {areas.error != null && <TextButton label={t('common.retry')} onPress={() => { void (areas.data ? areas.loadMore() : areas.refresh()); }} />}
      {areas.data?.items.length === 0 && <Text style={typography.supporting}>{t('integration.noAreas')}</Text>}
      {areas.data?.items.map((area) => <Text key={area.id} style={typography.supporting}>{area.name}</Text>)}
      {areas.data?.hasNext && <TextButton label={t('integration.loadMore')} disabled={areas.more} onPress={() => { void areas.loadMore(); }} />}
      <AppTextInput label={t('booking.address.pinCode')} value={pin} onChangeText={setPin} maxLength={6}
        keyboardType="number-pad" editable={!check.pending} />
      <TextButton label={t('integration.availability')} disabled={check.pending || !indianPinCodePattern.test(pin)} onPress={() => {
        void check.save(async () => { setCoverage({ pin, message: (await catalogue.checkArea({ postal_code: pin })).message }); });
      }} />
      {coverage?.pin === pin && <Text style={typography.supporting}>{coverage.message}</Text>}
      {check.failed && <Text style={typography.supporting}>{message(check.error, t('error.description'))}</Text>}
    </AppCard>
  </>;
}

