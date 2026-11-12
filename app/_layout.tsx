import '../global.css';

import * as NavigationBar from 'expo-navigation-bar';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { RotateCcw } from 'lucide-react-native';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { PrimaryButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer, Spacer } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { PushNotifications } from '@/features/notifications/PushNotifications';
import { AppProviders } from '@/providers/AppProviders';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, durations } from '@/theme';

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <AppProviders>
      <SystemBars />
      <ErrorScreen retry={retry} />
    </AppProviders>
  );
}

function ErrorScreen({ retry }: Pick<ErrorBoundaryProps, 'retry'>) {
  const { t } = useTranslation();

  return (
    <ScreenContainer>
      <ScrollContainer>
        <SectionHeader title={t('error.title')} subtitle={t('error.description')} />
        <Spacer />
        <PrimaryButton icon={RotateCcw} label={t('common.retry')} onPress={() => { void retry(); }} />
      </ScrollContainer>
    </ScreenContainer>
  );
}

export default function RootLayout() {
  return (
    <AppProviders>
      <StartupSystemBars />
      <PushNotifications><RootNavigator /></PushNotifications>
    </AppProviders>
  );
}

function StartupSystemBars() {
  const { phase } = useApplication();
  return <SystemBars darkSurface={phase === 'loading' || phase === 'unavailable'} />;
}

function SystemBars({ darkSurface = false }: { darkSurface?: boolean }) {
  useEffect(() => {
    if (Platform.OS === 'android') NavigationBar.setStyle(darkSurface ? 'dark' : 'light');
  }, [darkSurface]);

  return <StatusBar style={darkSurface ? 'light' : 'dark'} />;
}

function RootNavigator() {
  const { phase } = useApplication();
  const reduceMotion = useReducedMotion();
  const splash = phase === 'loading' || phase === 'unavailable';

  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.canvas },
      animation: reduceMotion ? 'none' : 'fade',
      animationDuration: durations.screen,
    }}>
      <Stack.Protected guard={splash}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'language'}>
        <Stack.Screen name="(onboarding)/language" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'onboarding'}>
        <Stack.Screen name="(onboarding)/welcome" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'registration'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'main'}>
        <Stack.Screen name="(main)" />
        <Stack.Screen name="booking/index" options={{
          animation: reduceMotion ? 'none' : 'slide_from_right',
        }} />
        <Stack.Screen name="booking/[bookingId]" />
        <Stack.Screen name="booking/success/[bookingId]" />
        <Stack.Screen name="settings/index" />
        <Stack.Screen name="settings/edit-profile" />
        <Stack.Screen name="settings/account" />
        <Stack.Screen name="settings/addresses" />
        <Stack.Screen name="services/[serviceId]" />
        <Stack.Screen name="settings/data-usage" />
        <Stack.Screen name="settings/delete-account" />
      </Stack.Protected>
      <Stack.Protected guard={phase === 'registration' || phase === 'main'}>
        <Stack.Screen name="privacy-policy" />
        <Stack.Screen name="terms-and-conditions" />
      </Stack.Protected>
    </Stack>
  );
}
