import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { durations, motion } from '@/theme';

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

type AnimatedPressableProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
};

export function AnimatedPressable({ style, onPressIn, onPressOut, ...props }: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const feedback = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressableBase
      {...props}
      style={[style, feedback]}
      onPressIn={(event) => {
        scale.value = withTiming(motion.pressScale, { duration: durations.pressIn, reduceMotion: ReduceMotion.System });
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, { duration: durations.pressOut, reduceMotion: ReduceMotion.System });
        onPressOut?.(event);
      }}
    />
  );
}
