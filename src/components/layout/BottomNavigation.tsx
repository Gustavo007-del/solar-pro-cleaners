import { LinearGradient } from 'expo-linear-gradient';
import { router, Tabs } from 'expo-router';
import { CalendarDays, House, Phone, Sparkles, UserRound, type LucideIcon } from 'lucide-react-native';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { appRoutes } from '@/constants/routes';
import { colors, durations, motion, radius, shadows, sizes, spacing, typography } from '@/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const tabs: Record<string, { label: 'nav.home' | 'nav.bookings' | 'nav.contact' | 'nav.profile'; icon: LucideIcon }> = {
  home: { label: 'nav.home', icon: House },
  'my-bookings': { label: 'nav.bookings', icon: CalendarDays },
  contact: { label: 'nav.contact', icon: Phone },
  profile: { label: 'nav.profile', icon: UserRound },
};

const barTop = 25;
const barBottom = 91;
const barHeight = 96;
const corner = 22;

function BarBackground({ width }: { width: number }) {
  const center = width / 2;
  const path = [
    `M ${corner} ${barTop} H ${center - 53}`,
    `C ${center - 38} ${barTop} ${center - 39} 44 ${center - 25} 55`,
    `C ${center - 11} 67 ${center + 11} 67 ${center + 25} 55`,
    `C ${center + 39} 44 ${center + 38} ${barTop} ${center + 53} ${barTop}`,
    `H ${width - corner} Q ${width} ${barTop} ${width} ${barTop + corner}`,
    `V ${barBottom - corner} Q ${width} ${barBottom} ${width - corner} ${barBottom}`,
    `H ${corner} Q 0 ${barBottom} 0 ${barBottom - corner}`,
    `V ${barTop + corner} Q 0 ${barTop} ${corner} ${barTop} Z`,
  ].join(' ');

  return (
    <Svg pointerEvents="none" width={width} height={barHeight} style={StyleSheet.absoluteFill}>
      <Path d={path} fill={colors.deep} opacity={0.15} transform="translate(0 3)" />
      <Path d={path} fill={colors.deep} />
    </Svg>
  );
}

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
      <Icon size={sizes.icon.md} strokeWidth={selected ? 2.4 : 1.8} color={selected ? colors.accent : colors.onHero} />
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
    opacity: 0.25 - pulse.value * 0.12,
    transform: [{ scale: 1 + pulse.value * 0.08 }],
  }));

  return (
    <AnimatedPressable accessibilityRole="button" accessibilityLabel={t('assistant.title')}
      onPress={() => router.navigate(appRoutes.assistant)} style={styles.assistantButton}>
      <Animated.View pointerEvents="none" style={[styles.orbGlow, glow]} />
      <LinearGradient colors={[colors.heroEnd, colors.ink]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.orb}>
        <Sparkles size={24} color={colors.accent} strokeWidth={1.8} />
      </LinearGradient>
    </AnimatedPressable>
  );
}

export function BottomNavigation({ state, descriptors, navigation, insets }: TabBarProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const availableWidth = width - insets.left - insets.right;
  const sideMargin = availableWidth < 350 ? spacing.xs : spacing.sm;
  const barWidth = Math.min(520, Math.max(0, availableWidth - 2 * sideMargin));

  function renderTab(route: TabBarProps['state']['routes'][number]) {
    const tab = tabs[route.name];
    if (!tab) return null;
    const selected = route.key === state.routes[state.index]?.key;
    const label = t(tab.label);
    const shortLabel = route.name === 'my-bookings' ? t('nav.bookingsTab') : label;
    return (
      <AnimatedPressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }}
        accessibilityLabel={label} testID={descriptors[route.key].options.tabBarButtonTestID}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        style={styles.tab}>
        <TabIcon icon={tab.icon} selected={selected} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3}
          style={[typography.metadata, styles.label, selected && styles.selectedLabel]}>{shortLabel}</Text>
      </AnimatedPressable>
    );
  }

  return (
    <View style={[
      styles.shell,
      { paddingBottom: insets.bottom + spacing.xxs, paddingLeft: insets.left + sideMargin,
        paddingRight: insets.right + sideMargin },
    ]}>
      <View style={[styles.tabs, { width: barWidth }]}>
        <BarBackground width={barWidth} />
        <View accessibilityRole="tablist" style={styles.tabGroup}>
          {state.routes.slice(0, 2).map(renderTab)}
        </View>
        <AssistantButton />
        <View accessibilityRole="tablist" style={styles.tabGroup}>
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
    height: barHeight,
    paddingHorizontal: spacing.xxs,
  },
  tabGroup: { flex: 1, flexDirection: 'row', minWidth: 0, marginTop: barTop + spacing.xxs, alignSelf: 'flex-start' },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    gap: 2,
    paddingVertical: spacing.xxs,
  },
  indicator: {
    width: 34,
    maxWidth: '100%',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlight: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.full,
    backgroundColor: colors.heroLine,
  },
  assistantButton: { width: 64, height: 54, alignItems: 'center', justifyContent: 'center' },
  orbGlow: { position: 'absolute', width: 54, height: 54, borderRadius: radius.full, backgroundColor: colors.secondary },
  orb: {
    width: 50, height: 50, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center',
    borderColor: colors.onHero, borderWidth: 1, ...shadows.overlay,
  },
  label: { textAlign: 'center', width: '100%', fontSize: 11, lineHeight: 16, color: colors.onHero },
  selectedLabel: { color: colors.accent },
});
