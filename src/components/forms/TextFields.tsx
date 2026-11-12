import type { LucideIcon } from 'lucide-react-native';
import type { Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { colors, durations, radius, sizes, spacing, typography } from '@/theme';

export type AppTextInputProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  leadingIcon?: LucideIcon;
  ref?: Ref<TextInput>;
};

export function AppTextInput({
  label, error, hint, leadingIcon: Icon, ref, style, multiline, editable = true, onFocus, onBlur, ...props
}: AppTextInputProps) {
  const focus = useSharedValue(0);
  const supportingText = error || hint;
  const border = useAnimatedStyle(() => ({
    borderColor: error ? colors.error : interpolateColor(focus.value, [0, 1], [colors.outline, colors.primary]),
  }));

  function animateFocus(value: number) {
    focus.value = withTiming(value, { duration: durations.pressIn, reduceMotion: ReduceMotion.System });
  }

  return (
    <View style={styles.field}>
      <Text style={[typography.label, styles.label]}>{label}</Text>
      <Animated.View style={[styles.frame, !editable && styles.disabledFrame, border]}>
        {Icon && (
          <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.icon, multiline && styles.multilineIcon]}>
            <Icon size={sizes.icon.md} color={error ? colors.error : colors.muted} />
          </View>
        )}
        <TextInput
          {...props}
          ref={ref}
          editable={editable}
          multiline={multiline}
          accessibilityLabel={props.accessibilityLabel ?? label}
          accessibilityHint={error ?? props.accessibilityHint ?? hint}
          accessibilityState={{ ...props.accessibilityState, disabled: !editable }}
          placeholderTextColor={colors.muted}
          cursorColor={colors.deep}
          selectionColor={colors.secondary}
          style={[typography.body, styles.input, multiline && styles.multiline, !editable && styles.disabledText, style]}
          onFocus={(event) => { animateFocus(1); onFocus?.(event); }}
          onBlur={(event) => { animateFocus(0); onBlur?.(event); }}
        />
      </Animated.View>
      {supportingText && (
        <Text accessibilityLiveRegion={error ? 'polite' : 'none'} style={[typography.supporting, error ? styles.error : styles.hint]}>
          {supportingText}
        </Text>
      )}
    </View>
  );
}

export type PhoneInputProps = Omit<AppTextInputProps, 'label' | 'multiline'> & { label?: string };

export function PhoneInput({ label, ...props }: PhoneInputProps) {
  const { t } = useTranslation();
  return (
    <AppTextInput
      keyboardType="phone-pad"
      autoComplete="tel"
      textContentType="telephoneNumber"
      {...props}
      label={label ?? t('common.phone')}
    />
  );
}

export function AppTextArea(props: Omit<AppTextInputProps, 'multiline'>) {
  return <AppTextInput {...props} multiline />;
}

const styles = StyleSheet.create({
  field: { gap: spacing.xxs },
  label: { color: colors.ink },
  frame: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
  },
  icon: { marginLeft: spacing.md },
  multilineIcon: { alignSelf: 'flex-start', marginTop: spacing.md },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.input,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.ink,
  },
  multiline: { minHeight: sizes.textArea, textAlignVertical: 'top' },
  disabledFrame: { backgroundColor: colors.disabled },
  disabledText: { color: colors.disabledText },
  error: { color: colors.error },
  hint: { color: colors.muted },
});
