import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { CalendarDays, House, Phone, Sparkles, UserRound, type LucideIcon } from 'lucide-react-native';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { appRoutes } from '@/constants/routes';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { colors, durations, motion, radius, shadows, sizes, spacing, typography } from '@/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs: Record<string, { label: 'nav.home' | 'nav.bookings' | 'nav.contact' | 'nav.profile'; icon: LucideIcon }> = {
  home: { label: 'nav.home', icon: House },
  'my-bookings': { label: 'nav.bookings', icon: CalendarDays },
  contact: { label: 'nav.contact', icon: Phone },
  profile: { label: 'nav.profile', icon: UserRound },
};

function TabIcon({ icon: Icon, selected }: { icon: LucideIcon; selected: boolean }) {
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: durations.tab, reduceMotion: ReduceMotion.System });
  }, [progress, selected]);

  const highlight = useAnimatedStyle(() => ({ opacity: progress.value }));
  const iconMotion = useAnimatedStyle(() => ({
    transform: [{ scale: motion.inactiveIconScale + (1 - motion.inactiveIconScale) * progress.value }],
  }));

  return (
    <Animated.View style={[styles.indicator, iconMotion]}>
      <Animated.View style={[styles.highlight, highlight]} />
      <Icon size={sizes.icon.md} strokeWidth={selected ? 2.5 : 1.8} color={selected ? colors.deep : colors.muted} />
    </Animated.View>
  );
}

function AssistantButton() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = reduceMotion ? 0 : withRepeat(withTiming(1, { duration: 1800 }), -1, true, undefined, ReduceMotion.System);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const glow = useAnimatedStyle(() => ({
    opacity: 0.55 - pulse.value * 0.3,
    transform: [{ scale: 1 + pulse.value * 0.13 }],
  }));

  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('assistant.title')}
      onPress={() => router.navigate(appRoutes.assistant)} style={styles.assistantButton}>
      <Animated.View pointerEvents="none" style={[styles.orbGlow, glow]} />
      <LinearGradient colors={[colors.heroEnd, colors.deep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.orb}>
        <Sparkles size={24} color={colors.surface} strokeWidth={1.8} />
      </LinearGradient>
    </AnimatedPressable>
  );
}

export function BottomNavigation({ state, descriptors, navigation, insets }: TabBarProps) {
  const { t } = useTranslation();
  const { screenWidth, textScale } = useScreenLayout();
  const useTwoRows = (screenWidth - 60 - 2 * spacing.xs) / textScale < 232;

  function renderTab(route: TabBarProps['state']['routes'][number]) {
    const tab = tabs[route.name];
    if (!tab) return null;
    const selected = route.key === state.routes[state.index]?.key;
    const label = t(tab.label);
    return (
      <AnimatedPressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }}
        accessibilityLabel={label} testID={descriptors[route.key].options.tabBarButtonTestID}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        style={[styles.tab, useTwoRows && styles.stackedTab]}>
        <TabIcon icon={tab.icon} selected={selected} />
        <Text style={[typography.metadata, styles.label, { color: selected ? colors.deep : colors.muted }]}>{label}</Text>
      </AnimatedPressable>
    );
  }

  return (
    <View style={[
      styles.shell,
      { paddingBottom: insets.bottom + spacing.xs, paddingLeft: insets.left + spacing.xs,
        paddingRight: insets.right + spacing.xs },
    ]}>
      <View style={styles.tabs}>
        <View accessibilityRole="tablist" style={[styles.tabGroup, useTwoRows && styles.stacked]}>
          {state.routes.slice(0, 2).map(renderTab)}
        </View>
        <AssistantButton />
        <View accessibilityRole="tablist" style={[styles.tabGroup, useTwoRows && styles.stacked]}>
          {state.routes.slice(2).map(renderTab)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.canvas,
    paddingTop: spacing.xxs,
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: sizes.screenMaxWidth,
    alignItems: 'center',
    padding: spacing.xxs,
    backgroundColor: '#FFFFFFF2',
    borderRadius: radius.xxl,
    borderColor: colors.border,
    borderWidth: 1,
    ...shadows.overlay,
  },
  tabGroup: { flex: 1, flexDirection: 'row', minWidth: 0 },
  stacked: { flexDirection: 'column' },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  stackedTab: { flex: 0 },
  indicator: {
    width: sizes.tabIndicator.width,
    maxWidth: '100%',
    height: sizes.tabIndicator.height,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
    backgroundColor: colors.mint,
    ...shadows.card,
  },
  assistantButton: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  orbGlow: { position: 'absolute', width: 50, height: 50, borderRadius: radius.full, backgroundColor: colors.secondary },
  orb: {
    width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center',
    borderColor: colors.heroLine, borderWidth: 1, ...shadows.overlay,
  },
  label: { textAlign: 'center', width: '100%' },
});
