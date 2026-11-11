import { Image } from 'react-native';

import { sizes } from '@/theme';

const mark = require('../../../assets/branding/splash-mark.png');

export function BrandMark({ size = sizes.splashMark }: { size?: number }) {
  return <Image source={mark} accessible={false} resizeMode="contain" resizeMethod="resize" style={{ width: size, height: size }} />;
}
