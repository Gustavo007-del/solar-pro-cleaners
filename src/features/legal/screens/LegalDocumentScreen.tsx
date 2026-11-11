import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { WebLinkButton } from '@/components/buttons/WebLinkButton';
import { Divider, ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { DetailRows } from '@/components/layout/DetailRows';
import { AppHeader, SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { businessContact } from '@/services/contact/businessContact';
import { colors, spacing, typography } from '@/theme';
import { backOrReplace } from '@/utils/navigation';

import { legalDocuments } from '../content/documents';

export function LegalDocumentScreen({ document }: { document: keyof typeof legalDocuments }) {
  const { t } = useTranslation();
  const { phase } = useApplication();
  const { title, sections } = legalDocuments[document];
  const publishedUrl = document === 'privacy' ? businessContact.privacyUrl : document === 'terms' ? businessContact.termsUrl : undefined;
  const fallback = phase === 'registration' ? appRoutes.registration : appRoutes.settings;
  const contactRows = (['legalName', 'phone', 'email'] as const).flatMap((key) => {
    const value = businessContact[key];
    return value ? [{ label: t(`contact.business.${key}`), value }] : [];
  });

  return (
    <ScreenContainer>
      <AppHeader title={t(title)} onBack={() => backOrReplace(fallback)} />
      <ScrollContainer contentContainerStyle={styles.content}>
        {document !== 'dataUsage' && (
          <AppCard style={styles.notice}>
            <Text style={[typography.supporting, styles.noticeText]}>{t('legal.reviewNotice')}</Text>
            {publishedUrl && <WebLinkButton label={t('legal.openOnline')} url={publishedUrl} />}
          </AppCard>
        )}
        <AppCard style={styles.document}>
          {sections.map((section, index) => (
            <View key={section} style={styles.section}>
              {index > 0 && <Divider />}
              <SectionHeader title={t(`legal.content.${section}.title`)} />
              <Text style={[typography.body, styles.body]}>{t(`legal.content.${section}.body`, { appName: t('brand.name') })}</Text>
              {section === 'contact' && (
                <>
                  {contactRows.length > 0 && <DetailRows rows={contactRows} />}
                  {businessContact.website && <WebLinkButton label={t('contact.business.website')} url={businessContact.website} />}
                </>
              )}
            </View>
          ))}
        </AppCard>
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingTop: spacing.sm },
  notice: { backgroundColor: colors.warningTint, borderColor: colors.warningTint },
  noticeText: { color: colors.warning },
  document: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  body: { color: colors.ink },
});
