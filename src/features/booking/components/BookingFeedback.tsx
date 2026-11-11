import { CircleAlert, Search } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { PrimaryButton, SecondaryButton } from '@/components/buttons/Buttons';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { InfoCard } from '@/components/surfaces/ContentCards';
import { OnboardingArt } from '@/features/onboarding/components/OnboardingArt';
import { colors, durations, radius, sizes, spacing, typography } from '@/theme';
import type { BookingFilter } from '@/types/booking';

export function BookingLoadingState() {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withRepeat(withTiming(0.55, { duration: durations.pulse }), -1, true, undefined, ReduceMotion.System);
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  return (
    <Animated.View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')} style={[styles.skeletons, pulse]}>
      <AppCard>
        <View style={[styles.line, styles.medium]} />
        <View style={styles.line} />
        <View style={[styles.line, styles.short]} />
      </AppCard>
      <AppCard>
        <View style={[styles.line, styles.medium]} />
        <View style={styles.line} />
      </AppCard>
    </Animated.View>
  );
}

export function BookingErrorState({ title, description, onRetry, onBack }: {
  title: string;
  description: string;
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <InfoCard icon={CircleAlert} title={title} description={description} footer={
      <View style={styles.actions}>
        {onRetry && <PrimaryButton label={t('common.retry')} onPress={onRetry} />}
        {onBack && <SecondaryButton label={t('booking.details.back')} onPress={onBack} />}
      </View>
    } />
  );
}

export function BookingEmptyState({ filter, onBook, onReset }: {
  filter: BookingFilter;
  onBook: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();

  if (filter !== 'all') {
    return (
      <Entrance variant="fade">
        <InfoCard
          icon={Search}
          title={t(`booking.history.empty.${filter}`)}
          description={t('booking.history.filteredEmpty')}
          footer={<SecondaryButton label={t('booking.history.viewAll')} onPress={onReset} />}
        />
      </Entrance>
    );
  }

  return (
    <Entrance>
      <AppCard style={styles.empty}>
        <View style={styles.art}><OnboardingArt scene="booking" /></View>
        <Text accessibilityRole="header" style={[typography.section, styles.title]}>{t('booking.history.empty.all')}</Text>
        <Text style={[typography.supporting, styles.copy]}>{t('booking.history.emptyDescription')}</Text>
        <PrimaryButton fullWidth label={t('nav.booking')} onPress={onBook} />
      </AppCard>
    </Entrance>
  );
}

const styles = StyleSheet.create({
  skeletons: { gap: spacing.sm },
  line: { height: spacing.sm, borderRadius: radius.full, backgroundColor: colors.disabled },
  medium: { width: '65%' },
  short: { width: '36%' },
  empty: { alignItems: 'center', padding: spacing.lg },
  art: { width: '100%', maxWidth: sizes.bookingEmptyArtMaxWidth, aspectRatio: 1.8, borderRadius: radius.lg, overflow: 'hidden' },
  title: { color: colors.ink, textAlign: 'center' },
  copy: { color: colors.muted, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
