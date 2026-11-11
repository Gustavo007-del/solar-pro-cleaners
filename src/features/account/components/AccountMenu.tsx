import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Divider } from '@/components/layout/Containers';
import { SectionHeader } from '@/components/layout/Headers';
import { AnimatedPressable } from '@/components/motion/AnimatedPressable';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, radius, sizes, spacing, typography } from '@/theme';

type AccountMenuItem = {
  label: string;
  description?: string;
  icon: LucideIcon;
  onPress: () => void;
  destructive?: boolean;
};

export function AccountMenu({ title, items }: { title?: string; items: readonly AccountMenuItem[] }) {
  return (
    <View style={styles.group}>
      {title && <SectionHeader title={title} />}
      <AppCard style={styles.card}>
        {items.map(({ label, description, icon: Icon, onPress, destructive }, index) => (
          <Fragment key={label}>
            {index > 0 && <Divider />}
            <AnimatedPressable accessibilityRole="button" onPress={onPress} style={styles.row}>
              <View style={[styles.icon, destructive && styles.dangerIcon]}>
                <Icon size={sizes.icon.md} color={destructive ? colors.error : colors.deep} />
              </View>
              <View style={styles.copy}>
                <Text style={[typography.label, styles.label, destructive && styles.dangerText]}>{label}</Text>
                {description && <Text style={[typography.supporting, styles.description]}>{description}</Text>}
              </View>
              <ChevronRight size={sizes.icon.sm} color={destructive ? colors.error : colors.muted} />
            </AnimatedPressable>
          </Fragment>
        ))}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  card: { gap: 0, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: sizes.touchTarget, padding: spacing.sm },
  icon: {
    width: sizes.icon.xl, height: sizes.icon.xl, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.md, backgroundColor: colors.mint,
  },
  dangerIcon: { backgroundColor: colors.errorTint },
  dangerText: { color: colors.error },
  copy: { flex: 1 },
  label: { color: colors.ink },
  description: { color: colors.muted },
});
