import { Tabs } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';

import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { colors } from '@/theme';

export default function MainLayout() {
  const reduceMotion = useReducedMotion();

  return (
    <Tabs
      initialRouteName="home"
      backBehavior="initialRoute"
      tabBar={(props) => <BottomNavigation {...props} />}
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? 'none' : 'fade',
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="my-bookings" />
      <Tabs.Screen name="contact" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
