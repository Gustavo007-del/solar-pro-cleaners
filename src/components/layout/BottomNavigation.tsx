import { Tabs } from 'expo-router';
import { CalendarDays, House, Phone, UserRound, type LucideIcon } from 'lucide-react-native';
import { useEffect, type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { colors, durations, motion, radius, sizes, spacing, typography } from '@/theme';

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

export function BottomNavigation({ state, descriptors, navigation, insets }: TabBarProps) {
  const { t } = useTranslation();
  const { screenWidth, textScale } = useScreenLayout();
  const useTwoRows = (screenWidth - 2 * spacing.xs) / textScale < 280;

  return (
    <View style={[
      styles.shell,
      { paddingBottom: insets.bottom + spacing.xs, paddingLeft: insets.left, paddingRight: insets.right },
    ]}>
      <View accessibilityRole="tablist" style={[styles.tabs, useTwoRows && styles.wrappedTabs]}>
        {state.routes.map((route, index) => {
          const tab = tabs[route.name];
          if (!tab) return null;
          const selected = index === state.index;
          const label = t(tab.label);

          return (
            <AnimatedPressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              testID={descriptors[route.key].options.tabBarButtonTestID}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={[styles.tab, useTwoRows && styles.halfTab]}
            >
              <TabIcon icon={tab.icon} selected={selected} />
              <Text style={[
                typography.metadata, styles.label,
                { color: selected ? colors.deep : colors.muted },
              ]}>{label}</Text>
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: spacing.xs,
  },
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    width: '100%',
    maxWidth: sizes.screenMaxWidth,
    paddingHorizontal: spacing.xs,
  },
  wrappedTabs: { flexWrap: 'wrap' },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  halfTab: { flexBasis: '50%', flexGrow: 0 },
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
  },
  label: { textAlign: 'center', width: '100%' },
});
