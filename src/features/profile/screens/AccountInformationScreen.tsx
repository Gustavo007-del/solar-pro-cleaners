import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { InfoCard } from '@/components/surfaces/ContentCards';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { spacing } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

import { ProfileInformation } from '../components/ProfileInformation';

export function AccountInformationScreen() {
  const { t } = useTranslation();
  const { profile } = useApplication();

  return (
    <ScreenContainer>
      <AppHeader title={t('profile.accountInformation')} onBack={() => backOrReplace(appRoutes.settings)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {profile ? (
          <>
            <ProfileInformation profile={profile} heading={false} />
            <PrimaryButton fullWidth label={t('booking.customer.edit')} onPress={() => router.push(appRoutes.editProfile)} />
          </>
        ) : <InfoCard title={t('profile.missingTitle')} description={t('profile.missing')} />}
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md } });
