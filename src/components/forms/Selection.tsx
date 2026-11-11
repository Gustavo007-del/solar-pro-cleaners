import { Check, type LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { SectionHeader } from '@/components/layout/Headers';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { colors, durations, radius, sizes, spacing, typography } from '@/theme';

export type AppCheckboxProps = {
  label: string;
  checked: boolean;
  onValueChange: (checked: boolean) => void;
  disabled?: boolean;
};

export function AppCheckbox({ label, checked, onValueChange, disabled }: AppCheckboxProps) {
  return (
    <AnimatedPressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!checked)}
      style={[styles.row, disabled && styles.disabled]}
    >
      <View style={[styles.checkbox, checked && styles.checked]}>
        {checked && <Check size={sizes.icon.sm} color={colors.surface} />}
      </View>
      <Text style={[typography.body, styles.label]}>{label}</Text>
    </AnimatedPressable>
  );
}

export type SelectionCardProps = {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon?: LucideIcon;
  style?: StyleProp<ViewStyle>;
};

export function SelectionCard({ label, description, selected, onSelect, disabled, icon: Icon, style }: SelectionCardProps) {
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: durations.tab, reduceMotion: ReduceMotion.System });
  }, [progress, selected]);

  const highlight = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.mint]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.outline, colors.primary]),
  }));

  return (
    <AnimatedPressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={description}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onSelect}
      style={[styles.row, styles.card, disabled && styles.disabled, style, highlight]}
    >
      {Icon && <Icon size={sizes.icon.lg} color={colors.deep} />}
      <View style={styles.copy}><SectionHeader title={label} subtitle={description} /></View>
      <View style={[styles.radio, selected && styles.selectedRadio]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touchTarget },
  copy: { flex: 1 },
  label: { flexShrink: 1, color: colors.ink },
  disabled: { opacity: 0.55 },
  checkbox: {
    alignItems: 'center',
    justifyContent: 'center',
    width: sizes.icon.lg,
    height: sizes.icon.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  checked: { backgroundColor: colors.deep, borderColor: colors.deep },
  card: {
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: colors.surface,
  },
  radio: {
    width: sizes.icon.md,
    height: sizes.icon.md,
    borderRadius: radius.full,
    borderColor: colors.outline,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRadio: { borderColor: colors.deep },
  radioDot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.full, backgroundColor: colors.deep },
});
