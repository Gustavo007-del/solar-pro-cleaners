import { Sparkles } from 'lucide-react-native';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { SectionHeader } from '@/components/layout/Headers';
import { FeatureCard } from '@/components/surfaces/ContentCards';
import { sizes, spacing } from '@/theme';

export function ServiceBenefits({ benefits }: { benefits: string[] }) {
  const { t } = useTranslation();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableWidth = Math.min(width - insets.left - insets.right, sizes.screenMaxWidth) - 2 * sizes.screenMargin;
  const columns = availableWidth >= sizes.benefitsGridMinWidth * Math.max(1, fontScale) ? 2 : 1;
  if (!benefits.length) return null;
  const rows = Array.from({ length: Math.ceil(benefits.length / columns) }, (_, index) =>
    benefits.slice(index * columns, (index + 1) * columns));

  return (
    <View style={styles.section}>
      <SectionHeader title={t('home.benefits.title')} />
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          {row.map((benefit, column) => <FeatureCard key={column} icon={Sparkles}
            layout={columns === 2 ? 'stack' : 'row'} title={benefit} style={styles.card} />)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  card: { flex: 1 },
});
