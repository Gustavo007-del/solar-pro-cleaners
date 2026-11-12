import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react-native';
import { Info } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { SectionHeader } from '@/components/layout/Headers';
import { colors, radius, sizes, spacing } from '@/theme';
import { AppCard, type AppCardProps } from './AppCard';

type ContentCardProps = Omit<AppCardProps, 'children'> & {
  title: string;
  description?: string;
  icon?: LucideIcon;
  footer?: ReactNode;
  layout?: 'row' | 'stack';
};

function ContentCard({ title, description, icon: Icon, footer, layout = 'row', ...props }: ContentCardProps) {
  const stacked = layout === 'stack';
  return (
    <AppCard {...props}>
      <View style={[styles.content, stacked && styles.stack]}>
        {Icon && <View style={styles.icon}><Icon size={sizes.icon.lg} color={colors.deep} /></View>}
        <View style={!stacked && styles.copy}><SectionHeader title={title} subtitle={description} /></View>
      </View>
      {footer}
    </AppCard>
  );
}

export function ServiceCard(props: ContentCardProps) {
  return <ContentCard elevated {...props} />;
}

export function InfoCard({ icon = Info, ...props }: ContentCardProps) {
  return <ContentCard icon={icon} {...props} />;
}

export function FeatureCard(props: ContentCardProps) {
  return <ContentCard {...props} />;
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  copy: { flex: 1, minWidth: 0 },
  icon: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.mint,
    borderRadius: radius.md,
  },
});
