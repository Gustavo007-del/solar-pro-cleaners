import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, sizes, spacing, typography } from '@/theme';

const tones = {
  neutral: { text: colors.muted, surface: colors.disabled },
  success: { text: colors.successText, surface: colors.mint },
  warning: { text: colors.warning, surface: colors.warningTint },
  error: { text: colors.error, surface: colors.errorTint },
};

export type StatusBadgeProps = {
  label: string;
  tone?: keyof typeof tones;
  palette?: { text: string; surface: string };
  icon?: LucideIcon;
};

export function StatusBadge({ label, tone = 'neutral', palette = tones[tone], icon: Icon }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: palette.surface }]}>
      {Icon && <Icon size={sizes.icon.sm} color={palette.text} />}
      <Text style={[typography.metadata, styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%',
    gap: spacing.xxs, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs,
  },
  label: { flexShrink: 1 },
});
