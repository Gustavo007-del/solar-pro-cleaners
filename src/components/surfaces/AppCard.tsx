import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { colors, radius, shadows, spacing } from '@/theme';

export type AppCardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  onPress?: PressableProps['onPress'];
  accessibilityLabel?: string;
}>;

export function AppCard({ style, children, onPress, accessibilityLabel, elevated }: AppCardProps) {
  const cardStyle = [styles.card, elevated && shadows.card, style];

  if (onPress) {
    return (
      <AnimatedPressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={cardStyle}>
        {children}
      </AnimatedPressable>
    );
  }

  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
