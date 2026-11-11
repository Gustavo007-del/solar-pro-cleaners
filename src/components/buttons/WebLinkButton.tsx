import { ExternalLink } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { openExternalLink } from '@/services/contact/externalLinks';
import { colors, spacing, typography } from '@/theme';

import { OutlineButton } from './Buttons';

export function WebLinkButton({ label, url }: { label: string; url: string }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  async function open() {
    setFailed(false);
    const result = await openExternalLink(url);
    if (result !== 'opened') setFailed(true);
  }

  return (
    <View style={styles.action}>
      <OutlineButton icon={ExternalLink} label={label} onPress={() => { void open(); }} compact />
      {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('contact.linkError')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: spacing.xs },
  error: { color: colors.error },
});
