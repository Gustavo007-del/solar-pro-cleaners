import { Phone, Smartphone, UserRound } from 'lucide-react-native';
import { useRef } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { StyleSheet, type TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppTextInput, PhoneInput } from '@/components/forms/TextFields';
import { spacing } from '@/theme';
import { maxCustomerNameLength } from '@/types/customerProfile';

import type { RegistrationInput, RegistrationOutput } from '../schemas/registrationSchema';

export function RegistrationFields({ control, disabled }: {
  control: Control<RegistrationInput, unknown, RegistrationOutput>;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const primary = useRef<TextInput>(null);
  const alternate = useRef<TextInput>(null);

  return (
    <View style={styles.fields}>
      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <AppTextInput
            ref={field.ref}
            label={t('registration.name')}
            placeholder={t('registration.enterName')}
            leadingIcon={UserRound}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => primary.current?.focus()}
            editable={!disabled}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error && (fieldState.error.message === 'registration.nameTooLong'
              ? t('registration.nameTooLong', { max: maxCustomerNameLength })
              : t('registration.invalidName'))}
          />
        )}
      />
      <Controller
        control={control}
        name="primaryPhone"
        render={({ field, fieldState }) => (
          <PhoneInput
            ref={(input) => { primary.current = input; field.ref(input); }}
            label={t('registration.primary')}
            placeholder={t('registration.enterMobile')}
            leadingIcon={Smartphone}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => alternate.current?.focus()}
            editable={!disabled}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error && (fieldState.error.message === 'registration.primaryRequired'
              ? t('registration.primaryRequired')
              : t('registration.invalidMobile'))}
          />
        )}
      />
      <Controller
        control={control}
        name="alternatePhone"
        render={({ field, fieldState }) => (
          <PhoneInput
            ref={(input) => { alternate.current = input; field.ref(input); }}
            label={t('registration.alternate')}
            placeholder={t('registration.enterMobile')}
            leadingIcon={Phone}
            autoComplete="off"
            textContentType="none"
            returnKeyType="done"
            editable={!disabled}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error && t('registration.invalidMobile')}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
});
