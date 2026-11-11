import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { SectionHeader } from '@/components/layout/Headers';
import { FeatureCard } from '@/components/surfaces/ContentCards';
import { sizes, spacing } from '@/theme';

import { serviceBenefits } from '../serviceContent';

export function ServiceBenefits() {
  const { t } = useTranslation();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableWidth = Math.min(width - insets.left - insets.right, sizes.screenMaxWidth) - 2 * sizes.screenMargin;
  const twoColumns = availableWidth >= sizes.benefitsGridMinWidth * Math.max(1, fontScale);
  const rows = twoColumns
    ? [serviceBenefits.slice(0, 2), serviceBenefits.slice(2)]
    : serviceBenefits.map((benefit) => [benefit]);

  return (
    <View style={styles.section}>
      <SectionHeader title={t('home.benefits.title')} />
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row[0].id} style={styles.row}>
            {row.map(({ id, icon }) => (
              <FeatureCard
                key={id}
                icon={icon}
                layout={twoColumns ? 'stack' : 'row'}
                title={t(`home.benefits.${id}.title`)}
                description={t(`home.benefits.${id}.description`)}
                style={styles.card}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grid: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1 },
});
