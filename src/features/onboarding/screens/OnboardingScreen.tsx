import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PrimaryButton, TextButton } from '@/components/buttons/Buttons';
import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { Entrance } from '@/components/motion/Entrance';
import { useSaveAction } from '@/hooks/useSaveAction';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { useApplication } from '@/providers/ApplicationProvider';
import { colors, radius, sizes, spacing, typography } from '@/theme';

import { OnboardingArt, type OnboardingScene } from '../components/OnboardingArt';
import { PageIndicators } from '../components/PageIndicators';

const scenes = ['cleaning', 'booking', 'location'] as const satisfies readonly OnboardingScene[];

export function OnboardingScreen() {
  const { t } = useTranslation();
  const { height } = useScreenLayout();
  const { finishOnboarding } = useApplication();
  const { pending, failed, save } = useSaveAction();
  const [index, setIndex] = useState(0);
  const scene = scenes[index];
  const last = index === scenes.length - 1;

  function advance() {
    if (last) void save(finishOnboarding);
    else setIndex((current) => Math.min(current + 1, scenes.length - 1));
  }

  return (
    <ScreenContainer>
      <ScrollContainer contentContainerStyle={styles.content}>
        <View style={styles.top}>
          <TextButton label={t('common.skip')} compact disabled={pending} onPress={() => { void save(finishOnboarding); }} />
        </View>
        <Entrance key={scene} variant="horizontal" style={styles.page}>
          <View style={[styles.art, { maxWidth: Math.min(sizes.onboardingArtMaxWidth, height * 0.46) }]}>
            <OnboardingArt scene={scene} />
          </View>
          <View style={styles.copy}>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[typography.display, styles.title]}>
              {t(`onboarding.${scene}.title`)}
            </Text>
            <Text style={[typography.body, styles.description]}>{t(`onboarding.${scene}.description`)}</Text>
          </View>
        </Entrance>
        <View style={styles.footer}>
          <PageIndicators index={index} count={scenes.length} />
          {failed && <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.error]}>{t('error.save')}</Text>}
          <PrimaryButton
            label={last ? t('common.getStarted') : t('common.continue')}
            icon={ArrowRight}
            iconPosition="end"
            loading={pending}
            fullWidth
            onPress={advance}
          />
        </View>
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: spacing.lg, paddingTop: spacing.xs },
  top: { alignItems: 'flex-end' },
  page: { gap: spacing.xl },
  art: {
    alignSelf: 'center',
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: radius.xxl,
    overflow: 'hidden',
  },
  copy: { gap: spacing.xs },
  title: { color: colors.ink },
  description: { color: colors.muted },
  footer: { gap: spacing.md, marginTop: 'auto' },
  error: { color: colors.error },
});
