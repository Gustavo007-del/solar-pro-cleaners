import { router } from 'expo-router';
import { CalendarDays, FileText, Languages, MapPin, Shield, Sun, Trash2, Type, UserRound, UserRoundPen } from 'lucide-react-native';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { OutlineButton } from '@/components/buttons/Buttons';
import { DetailRows } from '@/components/layout/DetailRows';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { SelectionCard } from '@/components/forms/Selection';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { appMetadata } from '@/constants/metadata';
import { appRoutes } from '@/constants/routes';
import { AccountMenu } from '@/features/account/components/AccountMenu';
import { useAppLanguage } from '@/hooks/useAppLanguage';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApiMessage } from '@/hooks/useApiMessage';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, sizes, spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

const options = [
  { locale: 'en', label: 'language.english', icon: Type },
  { locale: 'ml', label: 'language.malayalam', icon: Languages },
] as const;

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { locale, setLocale } = useAppLanguage();
  const { pending, failed, save } = useSaveAction();
  const { logout } = useApplication();
  const signOut = useSaveAction();
  const message = useApiMessage();
  const currentLanguage = i18n.resolvedLanguage ?? locale;

  function confirmLogout(all: boolean) {
    const label = t(all ? 'integration.logoutAll' : 'integration.logout');
    Alert.alert(label, t('integration.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: label, style: 'destructive', onPress: () => { void signOut.save(() => logout(all)); } },
    ]);
  }

  return (
    <ScreenContainer>
      <AppHeader title={t('nav.settings')} onBack={() => backOrReplace(appRoutes.profile)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        <Entrance variant="fade" style={styles.group}>
          <SectionHeader title={t('settings.preferences')} />
          <AppCard>
            <SectionHeader title={t('settings.language')} />
            <View accessibilityRole="radiogroup" style={styles.group}>
              {options.map(({ locale: code, label, icon }) => (
                <SelectionCard
                  key={code}
                  label={t(label)}
                  icon={icon}
                  selected={currentLanguage === code}
                  disabled={pending}
                  onSelect={() => { if (code !== locale) void save(() => setLocale(code)); }}
                />
              ))}
            </View>
            {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('error.save')}</Text>}
          </AppCard>
          <AppCard>
            <SectionHeader title={t('settings.light')} action={<Sun size={sizes.icon.md} color={colors.deep} />} />
          </AppCard>
        </Entrance>
        <Entrance variant="fade">
          <AccountMenu title={t('settings.account')} items={[
            { icon: UserRoundPen, label: t('booking.customer.edit'), description: t('settings.editDescription'), onPress: () => router.push(appRoutes.editProfile) },
            { icon: CalendarDays, label: t('nav.bookings'), description: t('profile.menu.bookings'), onPress: () => router.dismissTo(appRoutes.myBookings) },
            { icon: UserRound, label: t('profile.accountInformation'), description: t('settings.accountDescription'), onPress: () => router.push(appRoutes.accountInformation) },
            { icon: MapPin, label: t('integration.savedAddresses'), onPress: () => router.push(appRoutes.savedAddresses) },
            { icon: Trash2, label: t('accountDeletion.action'), destructive: true, onPress: () => router.push(appRoutes.deleteAccount) },
          ]} />
        </Entrance>
        <AppCard>
          <OutlineButton label={t('integration.logout')} disabled={signOut.pending} onPress={() => confirmLogout(false)} />
          <OutlineButton label={t('integration.logoutAll')} disabled={signOut.pending} onPress={() => confirmLogout(true)} />
          {signOut.pending && <Text style={typography.supporting}>{t('common.loading')}</Text>}
          {signOut.failed && <Text style={[typography.supporting, styles.error]}>{message(signOut.error, t('error.save'))}</Text>}
        </AppCard>
        <Entrance variant="fade">
          <AccountMenu title={t('settings.legal')} items={[
            { icon: Shield, label: t('legal.privacy'), description: t('settings.privacyDescription'), onPress: () => router.push(appRoutes.privacy) },
            { icon: FileText, label: t('legal.terms'), description: t('settings.termsDescription'), onPress: () => router.push(appRoutes.terms) },
            { icon: FileText, label: t('legal.dataUsage'), description: t('settings.dataDescription'), onPress: () => router.push(appRoutes.dataUsage) },
          ]} />
        </Entrance>
        <AppCard>
          <SectionHeader title={t('settings.about')} />
          <Text style={[typography.body, styles.title]}>{t('brand.name')}</Text>
          <Text style={[typography.supporting, styles.copy]}>{t('brand.descriptor')}</Text>
          <DetailRows rows={[{ label: t('settings.version'), value: appMetadata.version }]} />
          <Text style={[typography.metadata, styles.copy]}>{t('settings.copyright', { year: new Date().getFullYear(), name: t('brand.name') })}</Text>
        </AppCard>
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.sm },
  group: { gap: spacing.xs },
  title: { color: colors.ink },
  copy: { color: colors.muted },
  error: { color: colors.error },
});
