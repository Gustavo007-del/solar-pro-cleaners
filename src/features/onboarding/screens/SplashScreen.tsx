import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { BrandMark } from '@/components/brand/BrandMark';
import { SecondaryButton } from '@/components/buttons/Buttons';
import { SafeAreaWrapper, ScrollContainer } from '@/components/layout/Containers';
import { Entrance } from '@/components/motion/Entrance';
import { LoadingIndicator } from '@/components/motion/LoadingIndicator';
import { useApplication } from '@/providers/ApplicationProvider';
import { useApiMessage } from '@/hooks/useApiMessage';
import { colors, durations, radius, sizes, spacing, typography } from '@/theme';

const markEntrance = ZoomIn
  .withInitialValues({ transform: [{ scale: 0.92 }], opacity: 0 })
  .duration(durations.entrance)
  .reduceMotion(ReduceMotion.System);

export function SplashScreen() {
  const { phase, initializationError, retryInitialization } = useApplication();
  const { t } = useTranslation();
  const message = useApiMessage();

  return (
    <LinearGradient colors={[colors.deep, colors.heroEnd]} style={styles.fill}>
      <SafeAreaWrapper style={styles.safe}>
        <ScrollContainer contentContainerStyle={styles.content}>
          <Animated.View entering={markEntrance} style={styles.mark}>
            <BrandMark />
          </Animated.View>
          <Entrance style={styles.copy}>
            <Text accessibilityRole="header" style={[typography.display, styles.title]}>{t('brand.name')}</Text>
            <Text style={[typography.body, styles.tagline]}>{t('brand.tagline')}</Text>
          </Entrance>
          <View style={styles.status}>
            {phase === 'unavailable' ? (
              <>
                <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.tagline]}>{message(initializationError, t('error.startup'))}</Text>
                <SecondaryButton label={t('common.retry')} onPress={retryInitialization} />
              </>
            ) : (
              <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common.loading')}>
                <LoadingIndicator color={colors.accent} />
              </View>
            )}
          </View>
        </ScrollContainer>
      </SafeAreaWrapper>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  safe: { backgroundColor: 'transparent' },
  content: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg },
  mark: {
    width: sizes.splashMark,
    height: sizes.splashMark,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xxl,
    borderWidth: 1,
    borderColor: colors.heroLine,
  },
  copy: { width: '100%', maxWidth: sizes.screenMaxWidth, gap: spacing.xxs },
  title: { color: colors.surface, textAlign: 'center' },
  tagline: { color: colors.onHero, textAlign: 'center' },
  status: { alignItems: 'center', gap: spacing.md },
});
