import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { colors } from '@/theme';

export function SolarCleaningIllustration() {
  return (
    <Svg viewBox="0 0 400 154" width="100%" height="100%" accessible={false}>
      <Defs>
        <LinearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={colors.heroEnd} />
          <Stop offset="1" stopColor={colors.secondary} />
        </LinearGradient>
        <LinearGradient id="glass" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={colors.secondary} />
          <Stop offset="1" stopColor={colors.deep} />
        </LinearGradient>
      </Defs>

      <Rect width={400} height={154} fill="url(#sky)" />
      <Circle cx={324} cy={38} r={33} fill={colors.accent} opacity={0.13} />
      <Circle cx={324} cy={38} r={23} fill={colors.accent} opacity={0.88} />
      <Path d="M0 84Q52 33 118 72T226 78Q303 41 400 88v66H0z" fill={colors.deep} opacity={0.36} />
      <Path d="M0 110q67-36 141-9t121-7q62-18 138 10v50H0z" fill={colors.deep} opacity={0.68} />
      <Path d="M0 141q108-12 201-4t199-5v22H0z" fill={colors.deep} />

      <G strokeLinejoin="round">
        <Path d="m54 123 5 19m131-19 9 19m-147 0h158" fill="none" stroke={colors.ink} strokeWidth={4} strokeLinecap="round" />
        <Path d="m79 61 122 1 48 64H25z" fill={colors.ink} stroke={colors.ink} strokeWidth={7} />
        <Path d="m79 58 122 1 48 64H25z" fill="url(#glass)" stroke={colors.mint} strokeWidth={2} />
        <Path d="m110 59-26 64m56-64v64m30-64 26 64M62 79h154M44 100h188" fill="none" stroke={colors.onHero} strokeWidth={1.4} opacity={0.77} />
        <Path d="m78 61 65 1-46 59H34z" fill={colors.mint} opacity={0.12} />
      </G>

      <G strokeLinecap="round" strokeLinejoin="round">
        <Path d="m285 100-10 42m19-42 13 42m-42 0h10m32 0h10" fill="none" stroke={colors.ink} strokeWidth={7} />
        <Path d="M276 72q13-10 24 3l3 30h-29z" fill={colors.accent} />
        <Path d="m282 78-13 13-21-5" fill="none" stroke={colors.warningTint} strokeWidth={6} />
        <Path d="m248 86-78 21m-15 0 28 4" fill="none" stroke={colors.mint} strokeWidth={4} />
        <Circle cx={288} cy={62} r={10} fill={colors.warningTint} />
        <Path d="M277 60a11 11 0 0 1 22 0m-25 0h27" fill={colors.secondary} stroke={colors.deep} strokeWidth={2} />
      </G>

      <Path d="M120 53q0-8 8-8-8 0-8-8 0 8-8 8 8 0 8 8zM207 104q0-7 7-7-7 0-7-7 0 7-7 7 7 0 7 7z" fill={colors.mint} />
      <Path d="M228 72q0-6 6-6-6 0-6-6 0 6-6 6 6 0 6 6z" fill={colors.accent} />
    </Svg>
  );
}
