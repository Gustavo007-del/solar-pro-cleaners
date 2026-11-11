import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

export type OnboardingScene = 'cleaning' | 'booking' | 'location';

function SolarArray({ transform }: { transform?: string }) {
  return (
    <G transform={transform}>
      <Path d="M43 100v20m89-20v20M30 120h116" stroke={colors.deep} strokeWidth={4} strokeLinecap="round" />
      <Path d="M41 35h96l24 66H17z" fill={colors.deep} stroke={colors.deep} strokeWidth={7} strokeLinejoin="round" />
      <Path d="M41 35h96l24 66H17z" fill={colors.heroEnd} />
      <Path d="M73 35 65 101m40-66 8 66M33 57h112M25 79h128" stroke={colors.onHero} strokeWidth={2} />
    </G>
  );
}

function Cleaning() {
  return (
    <>
      <Circle cx={263} cy={65} r={25} fill={colors.accent} />
      <Path d="M263 24v10m0 62v10m-41-41h10m62 0h10m-70-29 7 7m45 45 7 7m0-59-7 7m-45 45-7 7" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" />
      <Path d="M0 178c75-28 125-28 188-5s105 16 172-10v77H0z" fill={colors.onHero} />
      <Path d="M0 198c84-25 130-16 196 6s117 6 164-12v48H0z" fill={colors.secondary} opacity={0.23} />
      <SolarArray transform="translate(55 60) scale(1.35)" />
      <Path d="M123 77c0 11 6 17 17 17-11 0-17 6-17 17 0-11-6-17-17-17 11 0 17-6 17-17z" fill={colors.surface} />
      <Path d="M223 111c0 7 4 11 11 11-7 0-11 4-11 11 0-7-4-11-11-11 7 0 11-4 11-11z" fill={colors.accent} />
    </>
  );
}

function Booking() {
  return (
    <>
      <Circle cx={182} cy={118} r={84} fill={colors.onHero} />
      <Path d="M66 146c4-36 22-64 52-85m145 108c15-14 23-33 26-53" stroke={colors.secondary} strokeWidth={2} strokeDasharray="4 8" strokeLinecap="round" />
      <Rect x={122} y={29} width={110} height={183} rx={19} fill={colors.deep} />
      <Rect x={128} y={35} width={98} height={171} rx={14} fill={colors.surface} />
      <Rect x={158} y={43} width={38} height={4} rx={2} fill={colors.onHero} />
      <Rect x={141} y={59} width={72} height={66} rx={9} fill={colors.mint} />
      <Circle cx={195} cy={74} r={7} fill={colors.accent} />
      <SolarArray transform="translate(150 70) scale(0.32)" />
      <Rect x={141} y={138} width={54} height={5} rx={2.5} fill={colors.secondary} />
      <Rect x={141} y={150} width={40} height={4} rx={2} fill={colors.onHero} />
      <Rect x={141} y={171} width={72} height={20} rx={7} fill={colors.deep} />
      <Rect x={159} y={179} width={36} height={4} rx={2} fill={colors.onHero} />
      <Rect x={207} y={96} width={62} height={56} rx={12} fill={colors.surface} stroke={colors.onHero} strokeWidth={2} />
      <Circle cx={238} cy={124} r={16} fill={colors.accent} />
      <Path d="m231 124 5 5 9-10" fill="none" stroke={colors.deep} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

function Location() {
  return (
    <>
      <Circle cx={161} cy={117} r={83} fill={colors.onHero} />
      <Path d="M0 196c81-15 139-18 205-4s109 11 155-5v53H0z" fill={colors.onHero} />
      <Path d="M83 198h196" stroke={colors.secondary} strokeWidth={2} strokeLinecap="round" />
      <Path d="M92 131l75-61 75 61v65H92z" fill={colors.surface} />
      <Path d="m83 134 84-68 84 68" fill="none" stroke={colors.deep} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m109 120 51-40 37 30-15 13z" fill={colors.heroEnd} stroke={colors.deep} strokeWidth={3} strokeLinejoin="round" />
      <Path d="m126 107 66 5m-43-23 33 32" stroke={colors.onHero} strokeWidth={1.5} />
      <Rect x={110} y={146} width={31} height={28} rx={4} fill={colors.mint} />
      <Path d="M125.5 146v28m-15.5-14h31" stroke={colors.secondary} strokeWidth={2} />
      <Path d="M164 196v-39a5 5 0 0 1 5-5h22a5 5 0 0 1 5 5v39" fill={colors.heroEnd} />
      <Path d="M275 43a21 21 0 0 0-21 21c0 14 21 34 21 34s21-20 21-34a21 21 0 0 0-21-21z" fill={colors.accent} />
      <Circle cx={275} cy={64} r={8} fill={colors.deep} />
      <Line x1={275} y1={104} x2={275} y2={119} stroke={colors.secondary} strokeWidth={2} strokeDasharray="3 4" />
      <Path d="M262 166v29m18-29v29" stroke={colors.deep} strokeWidth={7} strokeLinecap="round" />
      <Path d="M255 147q16-12 32 0v24h-32z" fill={colors.secondary} />
      <Path d="m255 152-10 17m41-17 10 17" stroke={colors.heroEnd} strokeWidth={6} strokeLinecap="round" />
      <Circle cx={271} cy={133} r={10} fill={colors.warningTint} />
      <Path d="M260 132a11 11 0 0 1 22 0m-25 0h28" stroke={colors.warning} strokeWidth={2} strokeLinecap="round" />
      <Rect x={291} y={169} width={18} height={13} rx={3} fill={colors.deep} />
    </>
  );
}

const scenes = { cleaning: Cleaning, booking: Booking, location: Location };

export function OnboardingArt({ scene }: { scene: OnboardingScene }) {
  const Scene = scenes[scene];
  return (
    <Svg width="100%" height="100%" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid slice" accessible={false}>
      <Rect width={360} height={240} fill={colors.mint} />
      <Scene />
    </Svg>
  );
}
