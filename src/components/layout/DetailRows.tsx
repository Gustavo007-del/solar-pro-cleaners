import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

export function DetailRows({ rows }: { rows: readonly { label: string; value: string }[] }) {
  return (
    <View style={styles.list}>
      {rows.map(({ label, value }) => (
        <View key={label} style={styles.row}>
          <Text style={[typography.label, styles.label]}>{label}</Text>
          <Text style={[typography.supporting, styles.value]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: { gap: spacing.xxs },
  label: { color: colors.ink },
  value: { color: colors.muted },
});
