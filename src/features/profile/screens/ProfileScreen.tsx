import { router } from 'expo-router';
import { CalendarDays, FileText, Headset, Settings, Shield, Trash2 } from 'lucide-react-native';
import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { Entrance } from '@/components/motion/Entrance';
import { InfoCard } from '@/components/surfaces/ContentCards';
import { appRoutes } from '@/constants/routes';
import { AccountMenu } from '@/features/account/components/AccountMenu';
import { useApplication } from '@/providers/ApplicationProvider';
import { useBookingResource } from '@/features/booking/hooks/useBookingResource';
import { BookingErrorState } from '@/features/booking/components/BookingFeedback';
import { useApiMessage } from '@/hooks/useApiMessage';
import { colors, spacing, typography } from '@/theme';

import { ProfileHero } from '../components/ProfileHero';
import { ProfileInformation } from '../components/ProfileInformation';

export function ProfileScreen() {
  const { t } = useTranslation();
  const { profile, reloadProfile } = useApplication();
  const current = useBookingResource(profile?.customerId, reloadProfile);
  const message = useApiMessage();

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <ScrollContainer contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={[typography.heading, styles.title]}>{t('profile.title')}</Text>
        {profile ? (
          <>
            <Entrance><ProfileHero profile={profile} /></Entrance>
            <ProfileInformation profile={profile} />
            {current.failed && <BookingErrorState title={t('error.title')}
              description={message(current.error, t('error.description'))} onRetry={current.refresh} />}
            <PrimaryButton fullWidth label={t('booking.customer.edit')} onPress={() => router.push(appRoutes.editProfile)} />
            <Entrance variant="fade">
              <AccountMenu items={[
                { icon: CalendarDays, label: t('nav.bookings'), description: t('profile.menu.bookings'), onPress: () => router.navigate(appRoutes.myBookings) },
                { icon: Settings, label: t('nav.settings'), description: t('profile.menu.settings'), onPress: () => router.push(appRoutes.settings) },
                { icon: Shield, label: t('legal.privacy'), onPress: () => router.push(appRoutes.privacy) },
                { icon: FileText, label: t('legal.terms'), onPress: () => router.push(appRoutes.terms) },
                { icon: Headset, label: t('profile.menu.support'), onPress: () => router.navigate(appRoutes.contact) },
                { icon: Trash2, label: t('accountDeletion.action'), destructive: true, onPress: () => router.push(appRoutes.deleteAccount) },
              ]} />
            </Entrance>
          </>
        ) : <InfoCard title={t('profile.missingTitle')} description={t('profile.missing')} />}
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.md },
  title: { color: colors.ink },
});
