import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sizes, spacing } from '@/theme';

export function useScreenLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const screenWidth = Math.min(Math.max(0, width - insets.left - insets.right), sizes.screenMaxWidth);
  const screenMargin = Math.min(sizes.screenMargin, Math.max(spacing.sm, Math.round(screenWidth * 0.05)));
  const contentWidth = Math.max(0, screenWidth - 2 * screenMargin);
  const textScale = Math.max(1, fontScale);

  return { height, screenWidth, screenMargin, contentWidth, textScale };
}
