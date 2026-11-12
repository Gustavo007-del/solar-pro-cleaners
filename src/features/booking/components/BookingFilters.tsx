import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { interpolateColor, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { colors, durations, radius, sizes, spacing, typography } from '@/theme';
import { bookingStatuses, type BookingFilter } from '@/types/booking';

const filters = ['all', ...bookingStatuses] as const;

function BookingFilterChip({ filter, selected, onPress }: { filter: BookingFilter; selected: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, { duration: durations.tab, reduceMotion: ReduceMotion.System });
  }, [progress, selected]);

  const highlight = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.surface, colors.mint]),
    borderColor: interpolateColor(progress.value, [0, 1], [colors.border, colors.primary]),
  }));

  return (
    <AnimatedPressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, highlight]}>
      <Text style={[typography.label, { color: selected ? colors.deep : colors.ink }]}>
        {filter === 'all' ? t('booking.history.all') : t(`booking.status.${filter}`)}
      </Text>
    </AnimatedPressable>
  );
}

export function BookingFilters({ selected, onChange }: { selected: BookingFilter; onChange: (filter: BookingFilter) => void }) {
  const { contentWidth, textScale } = useScreenLayout();
  const chips = filters.map((filter) => (
    <BookingFilterChip key={filter} filter={filter} selected={filter === selected} onPress={() => onChange(filter)} />
  ));
  if (contentWidth / textScale < 320) return <View style={styles.wrapped}>{chips}</View>;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.xs, alignItems: 'center' },
  wrapped: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    justifyContent: 'center', borderRadius: radius.full, borderWidth: 1,
    minHeight: sizes.touchTarget, paddingHorizontal: spacing.md, paddingVertical: spacing.xxs,
    maxWidth: '100%',
  },
});
