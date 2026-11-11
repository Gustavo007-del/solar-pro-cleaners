import { StyleSheet } from 'react-native';

import { ScreenContainer, ScrollContainer } from '@/components/layout/Containers';
import { Entrance } from '@/components/motion/Entrance';
import { durations, spacing } from '@/theme';

import { ContactSupportBanner } from '../components/ContactSupportBanner';
import { HomeHeader } from '../components/HomeHeader';
import { HomeHero } from '../components/HomeHero';
import { HowItWorks } from '../components/HowItWorks';
import { ServiceBenefits } from '../components/ServiceBenefits';
import { ServiceInformation } from '../components/ServiceInformation';
import { ServiceIntroduction } from '../components/ServiceIntroduction';

export function HomeScreen() {
  return (
    <ScreenContainer edges={['top', 'left', 'right']}>
      <ScrollContainer contentContainerStyle={styles.content}>
        <Entrance variant="fade"><HomeHeader /></Entrance>
        <Entrance><HomeHero /></Entrance>
        <Entrance variant="fade" delay={durations.sectionStagger}><ServiceIntroduction /></Entrance>
        <Entrance variant="fade" delay={2 * durations.sectionStagger}><ServiceBenefits /></Entrance>
        <Entrance variant="fade" delay={3 * durations.sectionStagger}><HowItWorks /></Entrance>
        <Entrance variant="fade" delay={3 * durations.sectionStagger}><ServiceInformation /></Entrance>
        <Entrance variant="fade" delay={3 * durations.sectionStagger}><ContactSupportBanner /></Entrance>
      </ScrollContainer>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
});
