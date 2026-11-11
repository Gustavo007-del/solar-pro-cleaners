import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { colors, durations, radius, spacing } from '@/theme';

function Dot({ selected }: { selected: boolean }) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: durations.tab, reduceMotion: ReduceMotion.System });
  }, [progress, selected]);

  const indicator = useAnimatedStyle(() => ({
    width: spacing.xs + spacing.md * progress.value,
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.outline, colors.deep]),
  }));

  return <Animated.View style={[styles.dot, indicator]} />;
}

export function PageIndicators({ index, count }: { index: number; count: number }) {
  const { t } = useTranslation();

  return (
    <View accessible accessibilityLabel={t('onboarding.progress', { current: index + 1, total: count })} style={styles.row}>
      {Array.from({ length: count }, (_, position) => <Dot key={position} selected={position === index} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { height: spacing.xs, borderRadius: radius.full },
});
