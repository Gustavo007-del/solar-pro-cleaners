import { router, useFocusEffect } from 'expo-router';
import { UserRound } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { appRoutes } from '@/constants/routes';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, radius, sizes, spacing, typography } from '@/theme';

function getGreetingPeriod() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function HomeHeader() {
  const { t } = useTranslation();
  const { profile } = useApplication();
  const [period, setPeriod] = useState(getGreetingPeriod);
  const firstName = profile?.fullName.trim().split(/\s+/)[0];
  const initial = firstName && Array.from(firstName)[0]?.toLocaleUpperCase();

  useFocusEffect(useCallback(() => {
    setPeriod(getGreetingPeriod());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setPeriod(getGreetingPeriod());
    });
    return () => subscription.remove();
  }, []));

  return (
    <View style={styles.header}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[typography.heading, styles.title]}>
          {firstName ? t(`home.greeting.${period}Named`, { name: firstName }) : t(`home.greeting.${period}`)}
        </Text>
        <Text style={[typography.supporting, styles.subtitle]}>{t('home.greeting.subtitle')}</Text>
      </View>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={t('nav.profile')}
        onPress={() => router.navigate(appRoutes.profile)}
        style={styles.avatar}
      >
        {initial
          ? <Text style={[typography.label, styles.initial]} maxFontSizeMultiplier={1.5}>{initial}</Text>
          : <UserRound color={colors.deep} size={sizes.icon.md} />}
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: spacing.xxs },
  title: { color: colors.ink },
  subtitle: { color: colors.muted },
  avatar: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    padding: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.mint,
    borderColor: colors.border,
    borderWidth: 1,
  },
  initial: { color: colors.deep },
});
