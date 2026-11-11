import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps, type ViewProps } from 'react-native';
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';

import { colors, sizes, spacing } from '@/theme';

export function SafeAreaWrapper({ style, ...props }: SafeAreaViewProps) {
  return <SafeAreaView {...props} style={[styles.safeArea, style]} />;
}

type ScreenContainerProps = PropsWithChildren<ViewProps & { edges?: SafeAreaViewProps['edges'] }>;

export function ScreenContainer({ edges, style, children, ...props }: ScreenContainerProps) {
  return (
    <SafeAreaWrapper edges={edges}>
      <View {...props} style={[styles.screen, style]}>{children}</View>
    </SafeAreaWrapper>
  );
}

export function ScrollContainer({ style, contentContainerStyle, ...props }: ScrollViewProps) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      {...props}
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
    />
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Spacer({ size = 'md' }: { size?: keyof typeof spacing }) {
  return <View style={{ width: spacing[size], height: spacing[size] }} />;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  screen: { flex: 1, width: '100%', maxWidth: sizes.screenMaxWidth, alignSelf: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: sizes.screenMargin, paddingTop: spacing.md, paddingBottom: spacing.xl },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
