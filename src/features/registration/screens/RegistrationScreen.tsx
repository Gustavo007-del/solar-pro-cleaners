import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { ArrowRight, Building2, ChevronDown, ShieldCheck, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { SelectionCard } from '@/components/forms/Selection';
import { AppTextInput } from '@/components/forms/TextFields';
import { FormScrollContainer, ScreenContainer } from '@/components/layout/Containers';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { Entrance } from '@/components/motion/Entrance';
import { appRoutes } from '@/constants/routes';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApiMessage } from '@/hooks/useApiMessage';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import { solarCapacityOptions } from '@/types/customerProfile';

import { RegistrationFields } from '../components/RegistrationFields';
import { type RegistrationInput, type RegistrationOutput, registrationSchema } from '../schemas/registrationSchema';
import { applyProfileValidation } from '../schemas/profileValidation';

const legalLinks = [
  { href: appRoutes.privacy, label: 'legal.privacy' },
  { href: appRoutes.terms, label: 'legal.terms' },
] as const;

export function RegistrationScreen() {
  const { t } = useTranslation();
  const { completeRegistration, knownInstallation, signIn } = useApplication();
  const { pending, failed, error, save } = useSaveAction();
  const message = useApiMessage();
  const [capacityOpen, setCapacityOpen] = useState(false);
  const { control, handleSubmit, setError } = useForm<RegistrationInput, unknown, RegistrationOutput>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { fullName: '', primaryPhone: '', alternatePhone: '', solarCompany: '', solarCapacityKv: null },
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const submit = handleSubmit((details) => save(async () => {
    Keyboard.dismiss();
    try { await completeRegistration(details); }
    catch (failure) { applyProfileValidation(failure, setError); throw failure; }
  }));

  return (
    <ScreenContainer>
      <FormScrollContainer contentContainerStyle={styles.content}>
        <Entrance style={styles.form}>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={[typography.display, styles.title]}>{t(knownInstallation ? 'integration.signIn' : 'registration.title')}</Text>
            <Text style={[typography.body, styles.supporting]}>{t(knownInstallation ? 'integration.signInHelp' : 'registration.description')}</Text>
          </View>

          {!knownInstallation && <View style={styles.fields}>
            <RegistrationFields control={control} disabled={pending} showAlternatePhone={false} />
            <Controller control={control} name="solarCompany" render={({ field, fieldState }) => (
              <AppTextInput ref={field.ref} label={t('registration.solarCompany')} leadingIcon={Building2}
                placeholder={t('registration.enterSolarCompany')} value={field.value ?? ''} editable={!pending}
                autoCapitalize="words" maxLength={100} onChangeText={field.onChange} onBlur={field.onBlur}
                error={fieldState.error ? t('registration.invalidSolarCompany') : undefined} />
            )} />
            <Controller control={control} name="solarCapacityKv" render={({ field, fieldState }) => (
              <View style={styles.capacity}>
                <Text style={styles.fieldLabel}>{t('registration.solarCapacity')}</Text>
                <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('registration.solarCapacity')}
                  accessibilityValue={{ text: field.value?.toString() ?? t('registration.chooseCapacity') }}
                  accessibilityState={{ expanded: capacityOpen, disabled: pending }} disabled={pending}
                  onPress={() => { Keyboard.dismiss(); setCapacityOpen((open) => !open); }}
                  style={[styles.capacityControl, pending && styles.disabled]}>
                  <Zap size={sizes.icon.md} color={colors.deep} />
                  <Text style={styles.capacityValue}>{field.value ?? t('registration.chooseCapacity')}</Text>
                  <ChevronDown size={sizes.icon.sm} color={colors.muted} />
                </AnimatedPressable>
                {capacityOpen && !pending && <View accessibilityRole="radiogroup" style={styles.capacityOptions}>
                  {[null, ...solarCapacityOptions].map((value) => (
                    <SelectionCard key={value ?? 'none'} label={value?.toString() ?? t('registration.noCapacity')}
                      selected={value === field.value} onSelect={() => {
                        field.onChange(value);
                        field.onBlur();
                        setCapacityOpen(false);
                      }} />
                  ))}
                </View>}
                {fieldState.error && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>
                  {t('registration.invalidCapacity')}
                </Text>}
              </View>
            )} />
          </View>}

          <View style={styles.privacy}>
            <ShieldCheck size={sizes.icon.md} color={colors.deep} />
            <Text style={[typography.supporting, styles.supporting, styles.privacyText]}>{t('registration.privacy')}</Text>
          </View>
        </Entrance>

        <View style={styles.footer}>
          {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{message(error, t('error.save'))}</Text>}
          <PrimaryButton
            label={t(knownInstallation ? 'integration.signIn' : 'common.saveAndContinue')}
            loadingLabel={t('common.saving')}
            icon={ArrowRight}
            iconPosition="end"
            fullWidth
            loading={pending}
            onPress={() => { if (knownInstallation) void save(signIn); else void submit(); }}
          />
          <View style={styles.links}>
            {legalLinks.map(({ href, label }) => (
              <Link key={href} href={href} asChild>
                <AnimatedPressable accessibilityRole="link" disabled={pending} style={styles.link}>
                  <Text style={[typography.label, styles.linkText]}>{t(label)}</Text>
                </AnimatedPressable>
              </Link>
            ))}
          </View>
        </View>
      </FormScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.xl },
  form: { gap: spacing.xl },
  fields: { gap: spacing.md },
  capacity: { gap: spacing.xxs },
  capacityOptions: { gap: spacing.xs, paddingTop: spacing.xxs },
  fieldLabel: { ...typography.label, color: colors.ink },
  capacityControl: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.input,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface,
    borderColor: colors.outline, borderWidth: 1, borderRadius: radius.lg,
  },
  disabled: { backgroundColor: colors.disabled },
  capacityValue: { ...typography.body, flex: 1, color: colors.ink },
  intro: { gap: spacing.xs },
  title: { color: colors.ink },
  supporting: { color: colors.muted },
  privacy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.mint,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  privacyText: { flex: 1, minWidth: 0, color: colors.deep },
  footer: { marginTop: 'auto', gap: spacing.xs },
  error: { color: colors.error },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: spacing.md },
  link: { minHeight: sizes.touchTarget, justifyContent: 'center', maxWidth: '100%', paddingHorizontal: spacing.xxs },
  linkText: { color: colors.deep, textAlign: 'center', textDecorationLine: 'underline' },
});
