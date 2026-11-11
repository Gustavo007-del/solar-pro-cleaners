import { Stack } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';

import { colors, durations } from '@/theme';

export const unstable_settings = { initialRouteName: 'profile-setup' };

export default function RegistrationLayout() {
  const reduceMotion = useReducedMotion();

  return (
    <Stack
      initialRouteName="profile-setup"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: reduceMotion ? 'none' : 'fade',
        animationDuration: durations.screen,
      }}
    >
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}
