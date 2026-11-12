import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { ArrowRight, ShieldCheck } from 'lucide-react-native';
import { useForm } from 'react-hook-form';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { FormScrollContainer, ScreenContainer } from '@/components/layout/Containers';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { Entrance } from '@/components/motion/Entrance';
import { appRoutes } from '@/constants/routes';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApiMessage } from '@/hooks/useApiMessage';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, radius, sizes, spacing, typography } from '@/theme';

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
  const { control, handleSubmit, setError } = useForm<RegistrationInput, unknown, RegistrationOutput>({
    resolver: zodResolver(registrationSchema),
    defaultValues: { fullName: '', primaryPhone: '', alternatePhone: '' },
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

          {!knownInstallation && <RegistrationFields control={control} disabled={pending} />}

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
