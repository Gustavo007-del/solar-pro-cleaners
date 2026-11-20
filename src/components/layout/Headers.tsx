import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/buttons/Buttons';
import { useScreenLayout } from '@/hooks/useScreenLayout';
import { colors, sizes, spacing, typography } from '@/theme';

export type SectionHeaderProps = { title: string; subtitle?: string; action?: ReactNode };

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <View style={styles.section}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[typography.section, styles.title]}>{title}</Text>
        {subtitle && <Text style={[typography.supporting, styles.subtitle]}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export type AppHeaderProps = { title: string; onBack?: () => void; action?: ReactNode; compact?: boolean };

export function AppHeader({ title, onBack, action, compact = false }: AppHeaderProps) {
  const { t } = useTranslation();
  const { screenMargin } = useScreenLayout();
  return (
    <View style={[styles.header, { paddingHorizontal: screenMargin }]}>
      {onBack && <IconButton icon={ArrowLeft} accessibilityLabel={t('common.back')} onPress={onBack} />}
      <Text accessibilityRole="header" numberOfLines={compact ? 1 : undefined}
        adjustsFontSizeToFit={compact} minimumFontScale={0.8}
        style={[typography.heading, styles.title, styles.headerTitle, compact && styles.compactTitle]}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  copy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: sizes.header,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { flex: 1, minWidth: 0 },
  compactTitle: { fontSize: 18, lineHeight: 27 },
  title: { color: colors.ink },
  subtitle: { color: colors.muted },
});
