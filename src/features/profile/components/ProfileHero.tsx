import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { CustomerProfile } from '@/types/customerProfile';

export function ProfileHero({ profile }: { profile: CustomerProfile }) {
  const { t } = useTranslation();
  const names = profile.fullName.trim().split(/\s+/);
  const initials = (names.length > 1 ? [names[0], names[names.length - 1]] : names)
    .map((name) => Array.from(name)[0] ?? '').join('').toLocaleUpperCase();

  return (
    <LinearGradient colors={[colors.deep, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.avatar} accessible={false}>
        <Text style={[typography.section, styles.initials]} maxFontSizeMultiplier={1.5}>{initials}</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[typography.metadata, styles.supporting]}>{t('profile.accountInformation')}</Text>
        <Text style={[typography.heading, styles.name]}>{profile.fullName}</Text>
        <Text style={[typography.supporting, styles.supporting]}>{profile.primaryPhone}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.xxl },
  avatar: {
    minWidth: sizes.button.standard, minHeight: sizes.button.standard, padding: spacing.xs,
    borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint,
  },
  initials: { color: colors.deep },
  copy: { flex: 1, gap: spacing.xxs },
  name: { color: colors.surface },
  supporting: { color: colors.onHero },
});
