import { router } from 'expo-router';
import { CalendarDays, Headset, MessageCircle, Phone } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { OutlineButton, PrimaryButton, TextButton } from '@/components/buttons/Buttons';
import { WebLinkButton } from '@/components/buttons/WebLinkButton';
import { FormScrollContainer, ScreenContainer } from '@/components/layout/Containers';
import { DetailRows } from '@/components/layout/DetailRows';
import { SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { InfoCard } from '@/components/surfaces/ContentCards';
import { appRoutes } from '@/constants/routes';
import { colors, spacing, typography } from '@/theme';

import { BusinessSchedule } from '../components/BusinessSchedule';
import { useApiMessage } from '@/hooks/useApiMessage';
import { useBusinessContact } from '../hooks/useBusinessContact';

const information = ['name', 'phone', 'whatsapp', 'email', 'address'] as const;

export function ContactScreen() {
  const { t } = useTranslation();
  const { businessContact, resource, failedAction, openContact } = useBusinessContact();
  const message = useApiMessage();
  const rows = information.flatMap((field) => {
    const value = businessContact[field];
    return value ? [{ label: t(`contact.business.${field}`), value }] : [];
  });

  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <FormScrollContainer contentContainerStyle={styles.content}>
        <Entrance style={styles.intro}>
          <Text accessibilityRole="header" style={[typography.heading, styles.title]}>{t('contact.title')}</Text>
          <Text style={[typography.supporting, styles.description]}>{t('contact.description')}</Text>
        </Entrance>
        <Entrance variant="fade">
          <InfoCard icon={Headset} title={t('contact.welcome.title')} description={t('contact.welcome.description')} style={styles.banner} />
        </Entrance>
        <InfoCard icon={Phone} title={t('home.support.call')} description={t('contact.call.description')} footer={
          <View style={styles.method}>
            <Text selectable={Boolean(businessContact.phone)} style={[typography.supporting, styles.description]}>
              {businessContact.phone ?? t('contact.call.unavailable')}
            </Text>
            <PrimaryButton label={t('contact.call.action')} compact disabled={!businessContact.phone} onPress={() => { void openContact('call'); }} />
            {failedAction === 'call' && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('home.support.callError')}</Text>}
          </View>
        } />
        <InfoCard icon={MessageCircle} title={t('home.support.whatsapp')} description={t('contact.whatsapp.description')} footer={
          <View style={styles.method}>
            {!businessContact.whatsapp && <Text style={[typography.supporting, styles.description]}>{t('contact.whatsapp.unavailable')}</Text>}
            <OutlineButton label={t('contact.whatsapp.action')} compact disabled={!businessContact.whatsapp} onPress={() => { void openContact('whatsapp'); }} />
            {failedAction === 'whatsapp' && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('home.support.whatsappError')}</Text>}
          </View>
        } />
        <InfoCard icon={CalendarDays} title={t('contact.booking.title')} description={t('contact.booking.description')} footer={
          <TextButton label={t('booking.success.myBookings')} compact onPress={() => router.navigate(appRoutes.myBookings)} />
        } />
        <AppCard>
          <SectionHeader title={t('contact.business.title')} />
          {resource.loading && !resource.data && <Text style={typography.supporting}>{t('common.loading')}</Text>}
          {resource.failed && <>
            <Text style={styles.error}>{message(resource.error, t('home.support.unavailable'))}</Text>
            <TextButton label={t('common.retry')} onPress={resource.refresh} />
          </>}
          {rows.length > 0 && <DetailRows rows={rows} />}
          {!rows.length && !businessContact.website && <Text style={[typography.supporting, styles.description]}>{t('home.support.unavailable')}</Text>}
          {businessContact.website && <WebLinkButton label={t('contact.business.website')} url={businessContact.website} />}
        </AppCard>
        <BusinessSchedule />
      </FormScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.md },
  intro: { gap: spacing.xxs },
  title: { color: colors.ink },
  description: { color: colors.muted },
  banner: { backgroundColor: colors.mint },
  method: { gap: spacing.xs },
  error: { color: colors.error },
});
