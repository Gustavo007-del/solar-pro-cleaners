import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { RegistrationFields } from '@/features/registration/components/RegistrationFields';
import { type RegistrationInput, type RegistrationOutput, registrationSchema } from '@/features/registration/schemas/registrationSchema';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApiMessage } from '@/hooks/useApiMessage';
import { applyProfileValidation } from '@/features/registration/schemas/profileValidation';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, spacing, typography } from '@/theme';
import type { CustomerDetails, CustomerProfile } from '@/types/customerProfile';
import { backOrReplace } from '@/utils/navigation';

const goBack = () => backOrReplace(appRoutes.profile);

export function EditProfileScreen() {
  const { t } = useTranslation();
  const { profile } = useApplication();

  return (
    <ScreenContainer>
      <AppHeader title={t('booking.customer.edit')} onBack={goBack} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollContainer keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
          {profile
            ? <EditProfileForm key={profile.customerId} profile={profile} />
            : <AppCard><Text style={[typography.body, styles.copy]}>{t('profile.missing')}</Text></AppCard>}
        </ScrollContainer>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function EditProfileForm({ profile }: { profile: CustomerProfile }) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { editProfile } = useApplication();
  const { pending, failed, error, save } = useSaveAction();
  const message = useApiMessage();
  const { control, handleSubmit, setError, formState: { isDirty, dirtyFields } } = useForm<RegistrationInput, unknown, RegistrationOutput>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { fullName: profile.fullName, primaryPhone: profile.primaryPhone, alternatePhone: profile.alternatePhone ?? '' },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const submit = handleSubmit((details) => save(async () => {
    Keyboard.dismiss();
    const changes: Partial<CustomerDetails> = {};
    if (dirtyFields.fullName) changes.fullName = details.fullName;
    if (dirtyFields.primaryPhone) changes.primaryPhone = details.primaryPhone;
    if (dirtyFields.alternatePhone) changes.alternatePhone = details.alternatePhone;
    try { await editProfile(changes); }
    catch (failure) { applyProfileValidation(failure, setError); throw failure; }
    if (navigation.isFocused()) goBack();
  }));

  return (
    <Entrance style={styles.content}>
      <Text style={[typography.body, styles.copy]}>{t('profile.editDescription')}</Text>
      <AppCard><RegistrationFields control={control} disabled={pending} /></AppCard>
      {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{message(error, t('error.save'))}</Text>}
      <PrimaryButton
        label={t('profile.saveChanges')}
        loadingLabel={t('common.saving')}
        fullWidth
        disabled={!isDirty}
        loading={pending}
        onPress={() => { void submit(); }}
      />
    </Entrance>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: spacing.md },
  copy: { color: colors.muted },
  error: { color: colors.error },
});
