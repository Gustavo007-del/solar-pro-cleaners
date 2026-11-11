import { type PropsWithChildren, useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInRight, ReduceMotion } from 'react-native-reanimated';

import { durations, motion } from '@/theme';

const fade = (delay: number) => FadeIn.duration(durations.entrance).delay(delay).reduceMotion(ReduceMotion.System);
const slide = (delay: number) => FadeInDown
  .withInitialValues({ transform: [{ translateY: motion.entranceOffset }] })
  .duration(durations.entrance)
  .delay(delay)
  .reduceMotion(ReduceMotion.System);

const horizontal = (delay: number) => FadeInRight
  .withInitialValues({ transform: [{ translateX: motion.pageOffset }] })
  .duration(durations.entrance)
  .delay(delay)
  .reduceMotion(ReduceMotion.System);

const entrances = { fade, slide, horizontal };

export function Entrance({ children, variant = 'slide', style, delay = 0 }: PropsWithChildren<{
  variant?: keyof typeof entrances;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}>) {
  const entering = useMemo(() => entrances[variant](delay), [delay, variant]);

  return <Animated.View entering={entering} style={style}>{children}</Animated.View>;
}
