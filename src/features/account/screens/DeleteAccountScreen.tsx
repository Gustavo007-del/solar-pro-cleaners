import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DestructiveButton, OutlineButton } from '@/components/buttons/Buttons';
import { WebLinkButton } from '@/components/buttons/WebLinkButton';
import { AppCheckbox } from '@/components/forms/Selection';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { InfoCard } from '@/components/surfaces/ContentCards';
import { appRoutes } from '@/constants/routes';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useApplication } from '@/providers/ApplicationProvider';
import { businessContact } from '@/services/contact/businessContact';
import { colors, spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

import { accountDeletionService, createAccountDeletionRequest } from '../services/accountDeletionService';
import type { AccountDeletionOutcome } from '../types/accountDeletion';

const goBack = () => backOrReplace(appRoutes.profile);

export function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { profile } = useApplication();
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [outcome, setOutcome] = useState<AccountDeletionOutcome>();
  const { pending, failed, save } = useSaveAction();
  const status = failed ? 'failed' : outcome?.status;

  function submit() {
    if (!profile || !acknowledged || !confirming) return;
    void save(async () => {
      setOutcome(await accountDeletionService.submit(createAccountDeletionRequest(profile.customerId)));
    });
  }

  return (
    <ScreenContainer>
      <AppHeader title={t('accountDeletion.title')} onBack={pending ? undefined : goBack} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {status ? (
          <Entrance>
            <InfoCard
              title={t(`accountDeletion.outcome.${status}.title`)}
              description={t(`accountDeletion.outcome.${status}.description`)}
              footer={
                <View style={styles.footer}>
                  {status === 'unavailable' && businessContact.deletionUrl && (
                    <WebLinkButton label={t('accountDeletion.openRequestPage')} url={businessContact.deletionUrl} />
                  )}
                  <View style={styles.actions}>
                    {status === 'failed' && <DestructiveButton label={t('common.retry')} loading={pending} onPress={submit} />}
                    <OutlineButton label={t('common.back')} disabled={pending} onPress={goBack} />
                  </View>
                </View>
              }
            />
          </Entrance>
        ) : (
          <>
            <InfoCard icon={Trash2} title={t('accountDeletion.warning')} description={t('accountDeletion.consequences')} style={styles.warning} />
            <AppCard>
              <Text style={[typography.body, styles.copy]}>{t('accountDeletion.retention')}</Text>
              <Text style={[typography.supporting, styles.copy]}>{t('accountDeletion.availability')}</Text>
              {businessContact.deletionUrl && <WebLinkButton label={t('accountDeletion.openRequestPage')} url={businessContact.deletionUrl} />}
            </AppCard>
            <Entrance key={confirming ? 'confirmation' : 'acknowledgement'}>
              <AppCard>
                {confirming ? (
                  <SectionHeader title={t('accountDeletion.confirm')} subtitle={t('accountDeletion.review')} />
                ) : (
                  <AppCheckbox label={t('accountDeletion.acknowledge')} checked={acknowledged} onValueChange={setAcknowledged} disabled={!profile} />
                )}
                {confirming ? (
                  <DestructiveButton label={t('accountDeletion.confirm')} fullWidth loading={pending} onPress={submit} />
                ) : (
                  <DestructiveButton label={t('common.continue')} fullWidth disabled={!acknowledged || !profile} onPress={() => setConfirming(true)} />
                )}
                <OutlineButton
                  label={t('common.cancel')}
                  fullWidth
                  disabled={pending}
                  onPress={() => {
                    if (confirming) {
                      setConfirming(false);
                      setAcknowledged(false);
                    } else goBack();
                  }}
                />
              </AppCard>
            </Entrance>
          </>
        )}
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.sm },
  warning: { backgroundColor: colors.errorTint },
  copy: { color: colors.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  footer: { gap: spacing.sm },
});
