import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, TextButton } from '@/components/buttons/Buttons';
import { AppTextInput } from '@/components/forms/TextFields';

import { parseBookingDate } from '../utils/bookingDate';

export function BookingDateField({ value, disabled, onChange }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const iso = parseBookingDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selected = iso ? new Date(`${iso}T12:00:00`) : today;
  const pickerDate = selected < today ? today : selected;

  function setDate(date: Date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    onChange(`${day}/${month}/${date.getFullYear()}`);
  }

  return <>
    <AppTextInput label={t('booking.form.optionalDate')} value={value} placeholder="DD/MM/YYYY"
      error={value.trim() && !iso ? t('booking.form.dateFormat') : undefined}
      maxLength={10} editable={!disabled} onChangeText={onChange} />
    {(Platform.OS === 'android' || Platform.OS === 'ios') && <OutlineButton icon={CalendarDays}
      label={t(showPicker && !disabled ? 'booking.form.done' : 'booking.form.chooseDate')} disabled={disabled}
      onPress={() => {
        if (Platform.OS === 'android') {
          DateTimePickerAndroid.open({ value: pickerDate, minimumDate: today, mode: 'date', display: 'calendar',
            onChange: (event, date) => { if (event.type === 'set' && date) setDate(date); } });
        } else setShowPicker(!showPicker);
      }} />}
    {Platform.OS === 'ios' && showPicker && !disabled && <DateTimePicker value={pickerDate}
      minimumDate={today} mode="date" display="inline" onChange={(_, date) => { if (date) setDate(date); }} />}
    {value.trim() !== '' && <TextButton label={t('booking.form.clearDate')} disabled={disabled}
      onPress={() => { setShowPicker(false); onChange(''); }} />}
  </>;
}
