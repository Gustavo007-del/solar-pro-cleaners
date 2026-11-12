import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { WebLinkButton } from '@/components/buttons/WebLinkButton';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { businessContact } from '@/services/contact/businessContact';
import { colors, spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { deletionUrl } = businessContact;

  return (
    <ScreenContainer>
      <AppHeader title={t('accountDeletion.title')} onBack={() => backOrReplace(appRoutes.profile)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        <AppCard>
          <Text style={styles.copy}>{t('accountDeletion.retention')}</Text>
          {deletionUrl ? (
            <WebLinkButton label={t('accountDeletion.openRequestPage')} url={deletionUrl} />
          ) : (
            <Text style={styles.copy}>{t('accountDeletion.availability')}</Text>
          )}
        </AppCard>
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm },
  copy: { ...typography.body, color: colors.muted },
});
