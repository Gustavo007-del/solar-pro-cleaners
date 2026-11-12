import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, radius, sizes, spacing, typography } from '@/theme';

import { serviceSteps } from '../serviceContent';

export function HowItWorks() {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <SectionHeader title={t('home.steps.title')} />
      <AppCard>
        <View>
          {serviceSteps.map(({ id, icon: Icon }, index) => {
            const last = index === serviceSteps.length - 1;
            return (
              <View key={id} style={styles.step}>
                <View style={styles.rail}>
                  {!last && <View style={styles.line} />}
                  <View style={styles.number} accessible accessibilityLabel={t('home.steps.number', { number: index + 1 })}>
                    <Text style={[typography.metadata, styles.numberText]}>{index + 1}</Text>
                  </View>
                </View>
                <View style={[styles.copy, !last && styles.stepSpacing]}>
                  <View style={styles.stepTitle}>
                    <Icon size={sizes.icon.sm} color={colors.deep} />
                    <Text style={[typography.label, styles.titleText]}>{t(`home.steps.${id}.title`)}</Text>
                  </View>
                  <Text style={[typography.supporting, styles.description]}>{t(`home.steps.${id}.description`)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: spacing.xxl, alignItems: 'center' },
  line: { position: 'absolute', top: spacing.md, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.outline },
  number: {
    minWidth: spacing.xxl,
    minHeight: spacing.xxl,
    paddingHorizontal: spacing.xxs,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.mint,
  },
  numberText: { color: colors.deep },
  copy: { flex: 1, minWidth: 0, gap: spacing.xxs },
  stepSpacing: { paddingBottom: spacing.md },
  stepTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  titleText: { color: colors.ink, flex: 1, minWidth: 0 },
  description: { color: colors.muted },
});
