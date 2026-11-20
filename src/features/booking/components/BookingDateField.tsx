import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarDays, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TextButton } from '@/components/buttons/Buttons';
import { AppTextInput } from '@/components/forms/TextFields';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { colors, radius, sizes, spacing, typography } from '@/theme';

import { parseBookingDate } from '../utils/bookingDate';

export function BookingDateField({ value, disabled, onChange }: {
  value: string; disabled: boolean; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { contentWidth, textScale } = useScreenLayout();
  const datePickerDisplay = (contentWidth - 2 * spacing.md) / textScale < 320 ? 'compact' : 'inline';
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
    {Platform.OS !== 'android' && Platform.OS !== 'ios' ? <AppTextInput label={t('booking.form.optionalDate')} value={value} placeholder="DD/MM/YYYY"
      error={value.trim() && !iso ? t('booking.form.dateFormat') : undefined}
      maxLength={10} editable={!disabled} onChangeText={onChange} /> : <View style={styles.field}>
      <Text style={styles.label}>{t('booking.form.optionalDate')}</Text>
      <AnimatedPressable accessibilityRole="button"
        accessibilityLabel={t('booking.form.optionalDate')}
        accessibilityValue={{ text: value || t('booking.form.chooseDate') }}
        accessibilityState={{ disabled, ...(Platform.OS === 'ios' ? { expanded: showPicker && !disabled } : {}) }}
        disabled={disabled} style={[styles.control, disabled && styles.disabled]}
      onPress={() => {
        Keyboard.dismiss();
        if (Platform.OS === 'android') {
          DateTimePickerAndroid.open({ value: pickerDate, minimumDate: today, mode: 'date', display: 'calendar',
            onChange: (event, date) => { if (event.type === 'set' && date) setDate(date); } });
        } else setShowPicker(!showPicker);
      }}>
        <CalendarDays size={sizes.icon.md} color={disabled ? colors.disabledText : colors.deep} />
        <Text style={[styles.value, !value && styles.placeholder, disabled && styles.disabledText]}>
          {value || t('booking.form.chooseDate')}
        </Text>
        <ChevronDown size={sizes.icon.sm} color={disabled ? colors.disabledText : colors.muted} />
      </AnimatedPressable>
      {value.trim() && !iso ? <Text accessibilityLiveRegion="polite" style={styles.error}>{t('booking.form.dateFormat')}</Text> : null}
    </View>}
    {Platform.OS === 'ios' && showPicker && !disabled && <DateTimePicker value={pickerDate}
      minimumDate={today} mode="date" display={datePickerDisplay} onChange={(_, date) => { if (date) setDate(date); }} />}
    {value.trim() !== '' && <TextButton label={t('booking.form.clearDate')} disabled={disabled}
      onPress={() => { setShowPicker(false); onChange(''); }} />}
  </>;
}

const styles = StyleSheet.create({
  field: { gap: spacing.xxs },
  label: { ...typography.label, color: colors.ink },
  control: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.input,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface,
    borderColor: colors.outline, borderWidth: 1, borderRadius: radius.lg,
  },
  value: { ...typography.body, flex: 1, color: colors.ink },
  placeholder: { color: colors.muted },
  disabled: { backgroundColor: colors.disabled },
  disabledText: { color: colors.disabledText },
  error: { ...typography.supporting, color: colors.error },
});
