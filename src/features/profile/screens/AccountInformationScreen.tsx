import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { InfoCard } from '@/components/surfaces/ContentCards';
import { AppCard } from '@/components/surfaces/AppCard';
import { DetailRows } from '@/components/layout/DetailRows';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { useBookingResource } from '@/features/booking/hooks/useBookingResource';
import { BookingErrorState, BookingLoadingState } from '@/features/booking/components/BookingFeedback';
import { formatBookingDate } from '@/features/booking/utils/bookingDate';
import { useApiMessage } from '@/hooks/useApiMessage';
import { customerRequest } from '@/services/api/session';
import { accountSchema } from '@/services/api/customerSchemas';
import { spacing } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

import { ProfileInformation } from '../components/ProfileInformation';

const readAccount = () => customerRequest('/customers/me/account', accountSchema);

export function AccountInformationScreen() {
  const { t, i18n } = useTranslation();
  const { profile } = useApplication();
  const account = useBookingResource(profile?.customerId, readAccount);
  const message = useApiMessage();

  return (
    <ScreenContainer>
      <AppHeader title={t('profile.accountInformation')} onBack={() => backOrReplace(appRoutes.settings)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {profile ? (
          <>
            <ProfileInformation profile={profile} heading={false} />
            {account.loading && !account.data && <BookingLoadingState />}
            {account.failed && <BookingErrorState title={t('error.title')}
              description={message(account.error, t('error.description'))} onRetry={account.refresh} />}
            {account.data && !account.failed && <AppCard><DetailRows rows={[
              { label: t('integration.accountStatus'), value: t(account.data.is_active ? 'integration.accountActive' : 'integration.accountInactive') },
              { label: t('integration.registered'), value: formatBookingDate(account.data.created_at, i18n.resolvedLanguage) },
            ]} /></AppCard>}
            <PrimaryButton fullWidth label={t('booking.customer.edit')} onPress={() => router.push(appRoutes.editProfile)} />
          </>
        ) : <InfoCard title={t('profile.missingTitle')} description={t('profile.missing')} />}
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md } });
