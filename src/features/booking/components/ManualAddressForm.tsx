import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, type TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SecondaryButton, TextButton } from '@/components/buttons/Buttons';
import { AppTextInput } from '@/components/forms/TextFields';
import { SectionHeader } from '@/components/layout/Headers';
import { spacing } from '@/theme';
import { maxBookingAddressPart, type ManualBookingAddress } from '@/types/booking';

import { formatManualAddress, manualAddressSchema, type ManualAddressInput } from '../schemas/addressSchema';

const fields = ['houseName', 'locality', 'city', 'district', 'state', 'landmark', 'pinCode'] as const;

type Props = {
  defaults: ManualAddressInput;
  onChange: (field: keyof ManualAddressInput, value: string) => void;
  onSave: (address: ManualBookingAddress) => void;
  onCancel: () => void;
};

export function ManualAddressForm({ defaults, onChange, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const inputs = useRef<Partial<Record<keyof ManualAddressInput, TextInput>>>({});
  const { control, handleSubmit } = useForm<ManualAddressInput>({
    resolver: zodResolver(manualAddressSchema),
    defaultValues: defaults,
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  function errorMessage(message: string | undefined) {
    if (!message) return undefined;
    if (message === 'invalidPin') return t('booking.address.invalidPin');
    if (message === 'tooLong') return t('booking.address.tooLong', { max: maxBookingAddressPart });
    return t('booking.address.required');
  }

  const submit = handleSubmit((values) => {
    Keyboard.dismiss();
    onSave(formatManualAddress(values));
  });

  return (
    <View style={styles.fields}>
      <SectionHeader title={t('booking.address.title')} />
      {fields.map((name, index) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field, fieldState }) => (
            <AppTextInput
              ref={(input) => {
                if (input) inputs.current[name] = input;
                else delete inputs.current[name];
                field.ref(input);
              }}
              label={t(`booking.address.${name}`)}
              value={field.value}
              autoCapitalize={name === 'pinCode' ? 'none' : 'words'}
              keyboardType={name === 'pinCode' ? 'number-pad' : 'default'}
              returnKeyType={index < fields.length - 1 ? 'next' : 'done'}
              submitBehavior={index < fields.length - 1 ? 'submit' : 'blurAndSubmit'}
              onSubmitEditing={() => {
                const next = fields[index + 1];
                if (next) inputs.current[next]?.focus();
              }}
              maxLength={name === 'pinCode' ? 6 : maxBookingAddressPart}
              onBlur={field.onBlur}
              onChangeText={(value) => { field.onChange(value); onChange(name, value); }}
              error={errorMessage(fieldState.error?.message)}
            />
          )}
        />
      ))}
      <View style={styles.actions}>
        <SecondaryButton label={t('booking.address.save')} onPress={() => { void submit(); }} />
        <TextButton label={t('common.cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
