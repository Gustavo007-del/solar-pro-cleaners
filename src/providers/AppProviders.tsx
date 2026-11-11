import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { colors } from '@/theme';
import { ApplicationProvider } from './ApplicationProvider';
import { LocalizationProvider } from './LocalizationProvider';

const navigationTheme: typeof DefaultTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.deep,
    background: colors.canvas,
    card: colors.surface,
    text: colors.ink,
    border: colors.border,
    notification: colors.error,
  },
};

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider value={navigationTheme}>
          <LocalizationProvider>
            <ApplicationProvider>{children}</ApplicationProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
});
