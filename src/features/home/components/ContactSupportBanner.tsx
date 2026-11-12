import { Headset, MessageCircle, Phone } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, PrimaryButton } from '@/components/buttons/Buttons';
import { FeatureCard } from '@/components/surfaces/ContentCards';
import { useBusinessContact } from '@/features/contact/hooks/useBusinessContact';
import { colors, spacing, typography } from '@/theme';

export function ContactSupportBanner() {
  const { t } = useTranslation();
  const { businessContact, resource, failedAction, openContact } = useBusinessContact();
  const unavailable = !businessContact.phone && !businessContact.whatsapp;

  return (
    <FeatureCard
      title={t('home.support.title')}
      description={t('home.support.description')}
      icon={Headset}
      style={styles.banner}
      footer={
        <View style={styles.footer}>
          <View style={styles.actions}>
            <PrimaryButton
              label={t('home.support.call')}
              icon={Phone}
              compact
              disabled={!businessContact.phone}
              onPress={() => { void openContact('call'); }}
            />
            <OutlineButton
              label={t('home.support.whatsapp')}
              icon={MessageCircle}
              compact
              disabled={!businessContact.whatsapp}
              onPress={() => { void openContact('whatsapp'); }}
            />
          </View>
          {resource.loading && !resource.data && <Text style={typography.supporting}>{t('common.loading')}</Text>}
          {unavailable && !resource.loading && <Text style={[typography.supporting, styles.note]}>{t('home.support.unavailable')}</Text>}
          {failedAction && (
            <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>
              {t(failedAction === 'call' ? 'home.support.callError' : 'home.support.whatsappError')}
            </Text>
          )}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.mint },
  footer: { gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  note: { color: colors.muted },
  error: { color: colors.error },
});
