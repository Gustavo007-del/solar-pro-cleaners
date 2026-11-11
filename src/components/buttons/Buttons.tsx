import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { LoadingIndicator } from '@/components/motion/LoadingIndicator';
import { colors, radius, sizes, spacing, typography } from '@/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'text' | 'destructive';

const variants = {
  primary: { backgroundColor: colors.deep, borderColor: colors.deep, foreground: colors.surface },
  secondary: { backgroundColor: colors.mint, borderColor: colors.mint, foreground: colors.deep },
  outline: { backgroundColor: 'transparent', borderColor: colors.outline, foreground: colors.deep },
  text: { backgroundColor: 'transparent', borderColor: 'transparent', foreground: colors.deep },
  destructive: { backgroundColor: colors.error, borderColor: colors.error, foreground: colors.surface },
} satisfies Record<Variant, { backgroundColor: string; borderColor: string; foreground: string }>;

type InteractionProps = {
  onPress: NonNullable<PressableProps['onPress']>;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export type ButtonProps = InteractionProps & {
  label: string;
  loadingLabel?: string;
  icon?: LucideIcon;
  iconPosition?: 'start' | 'end';
  fullWidth?: boolean;
  compact?: boolean;
};

function Button({
  variant, label, icon: Icon, iconPosition = 'start', fullWidth, compact,
  disabled, loading, loadingLabel, onPress, style,
}: ButtonProps & { variant: Variant }) {
  const { t } = useTranslation();
  const { backgroundColor, borderColor, foreground } = variants[variant];
  const iconColor = disabled ? colors.disabledText : foreground;
  const icon = loading ? <LoadingIndicator color={iconColor} /> : Icon && <Icon size={sizes.icon.md} color={iconColor} />;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.base,
        {
          backgroundColor: disabled ? colors.disabled : backgroundColor,
          borderColor: disabled ? colors.disabled : borderColor,
          minHeight: compact ? sizes.button.compact : sizes.button.standard,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {iconPosition === 'start' && icon}
      <Text style={[typography.button, styles.label, { color: iconColor }]}>
        {loading ? loadingLabel ?? t('common.loading') : label}
      </Text>
      {iconPosition === 'end' && icon}
    </AnimatedPressable>
  );
}

export function PrimaryButton(props: ButtonProps) { return <Button variant="primary" {...props} />; }
export function SecondaryButton(props: ButtonProps) { return <Button variant="secondary" {...props} />; }
export function OutlineButton(props: ButtonProps) { return <Button variant="outline" {...props} />; }
export function TextButton(props: ButtonProps) { return <Button variant="text" {...props} />; }
export function DestructiveButton(props: ButtonProps) { return <Button variant="destructive" {...props} />; }

export type IconButtonProps = InteractionProps & { icon: LucideIcon; accessibilityLabel: string };

export function IconButton({ icon: Icon, accessibilityLabel, disabled, loading, onPress, style }: IconButtonProps) {
  const { t } = useTranslation();
  const color = disabled ? colors.disabledText : colors.deep;
  return (
    <AnimatedPressable
      accessibilityLabel={loading ? t('common.loading') : accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.base, styles.iconButton, disabled && styles.disabled, style]}
    >
      {loading ? <LoadingIndicator color={color} /> : <Icon size={sizes.icon.lg} color={color} />}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.lg,
    maxWidth: '100%',
  },
  fullWidth: { alignSelf: 'stretch' },
  label: { textAlign: 'center', flexShrink: 1 },
  iconButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: colors.mint,
    borderColor: colors.mint,
  },
  disabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
});
