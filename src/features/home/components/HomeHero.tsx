import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { ArrowRight, MapPin } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SecondaryButton } from '@/components/buttons/Buttons';
import { appRoutes } from '@/constants/routes';
import { colors, radius, shadows, sizes, spacing, typography } from '@/theme';

import { SolarCleaningIllustration } from '../assets/SolarCleaningIllustration';

export function HomeHero() {
  const { t } = useTranslation();

  return (
    <View style={styles.shadow}>
      <LinearGradient colors={[colors.deep, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.copy}>
          <Text accessibilityRole="header" style={[typography.heading, styles.title]}>{t('home.hero.title')}</Text>
          <Text style={[typography.supporting, styles.description]}>{t('home.hero.description')}</Text>
          <SecondaryButton
            label={t('nav.booking')}
            icon={ArrowRight}
            iconPosition="end"
            onPress={() => router.navigate(appRoutes.booking)}
            style={styles.cta}
          />
        </View>
        <View style={styles.art}><SolarCleaningIllustration /></View>
        <View style={styles.serviceArea}>
          <MapPin color={colors.accent} size={sizes.icon.sm} />
          <Text style={[typography.metadata, styles.serviceAreaText]}>{t('home.hero.location')}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { ...shadows.card, borderRadius: radius.xxl, backgroundColor: colors.deep },
  card: { borderRadius: radius.xxl, overflow: 'hidden' },
  copy: { padding: spacing.lg, gap: spacing.xs },
  title: { color: colors.surface },
  description: { color: colors.onHero },
  cta: { marginTop: spacing.xs, backgroundColor: colors.accent, borderColor: colors.accent },
  art: { aspectRatio: 400 / 154 },
  serviceArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.deep,
  },
  serviceAreaText: { flex: 1, color: colors.onHero },
});
