import { Linking, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton } from '@/components/buttons/Buttons';
import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, typography } from '@/theme';
import { usePushNotifications } from './PushNotifications';

export function NotificationSettings() {
  const { t } = useTranslation();
  const { status, busy, optedIn, permission, update, retry } = usePushNotifications();
  return <AppCard>
    <SectionHeader title={t('notifications.title')} subtitle={t('notifications.explanation')} />
    <Text accessibilityLiveRegion="polite" style={[typography.supporting, { color: colors.muted }]}>
      {t(busy ? 'notifications.loading' : `notifications.${status}`)}
    </Text>
    {!busy && permission && <Text style={[typography.metadata, { color: colors.muted }]}>
      {t(`notifications.permission.${permission}`)}
    </Text>}
    {status === 'denied' && <OutlineButton label={t('notifications.openSettings')} disabled={busy}
      onPress={() => { void Linking.openSettings().catch(() => undefined); }} />}
    {status === 'permissionRequired' && <OutlineButton label={t('notifications.allow')} disabled={busy}
      onPress={() => update(true)} />}
    {status === 'error' && <OutlineButton label={t('common.retry')} disabled={busy} onPress={retry} />}
    {status !== 'unavailable' && status !== 'loading' &&
      <OutlineButton label={t(optedIn ? 'notifications.disable' : 'notifications.enable')} disabled={busy}
        onPress={() => update(!optedIn)} />}
  </AppCard>;
}
