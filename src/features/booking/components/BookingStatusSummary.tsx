import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppCard } from '@/components/surfaces/AppCard';
import { colors, spacing, typography } from '@/theme';

type Counts = { total: number; pending: number; confirmed: number; completed: number };

export function BookingStatusSummary({ counts }: { counts: Counts }) {
  const { t, i18n } = useTranslation();
  const formatter = new Intl.NumberFormat(i18n.resolvedLanguage);
  const groups = [
    [{ label: t('booking.history.total'), value: counts.total }, { label: t('booking.status.pending'), value: counts.pending }],
    [{ label: t('booking.status.confirmed'), value: counts.confirmed }, { label: t('booking.status.completed'), value: counts.completed }],
  ];

  return (
    <View style={styles.grid}>
      {groups.map((group, index) => (
        <View key={index} style={styles.row}>
          {group.map(({ label, value }) => (
            <AppCard key={label} style={styles.counter}>
              <Text style={[typography.section, styles.value]}>{formatter.format(value)}</Text>
              <Text style={[typography.metadata, styles.label]}>{label}</Text>
            </AppCard>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.xs },
  counter: { flex: 1, gap: 0, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  value: { color: colors.deep },
  label: { color: colors.muted },
});
