import { useEffect } from 'react';
import { Sun } from 'lucide-react-native';
import Animated, {
  cancelAnimation, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';

import { colors, durations, sizes } from '@/theme';

export function LoadingIndicator({ color = colors.primary, size = sizes.icon.md }: { color?: string; size?: number }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.4, { duration: durations.pulse }), -1, true, undefined, ReduceMotion.System);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  return <Animated.View accessible={false} style={style}><Sun color={color} size={size} /></Animated.View>;
}
