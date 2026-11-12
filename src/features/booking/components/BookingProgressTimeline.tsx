import { Check, CircleDot } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SectionHeader } from '@/components/layout/Headers';
import { Entrance } from '@/components/motion/Entrance';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, radius, sizes, spacing, typography } from '@/theme';
import type { Booking } from '@/types/booking';

import { getBookingStatusPresentation } from '../utils/bookingStatus';

const steps = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed'] as const;

export function BookingProgressTimeline({ status, history }: { status: Booking['status']; history: Booking['history'] }) {
  const { t } = useTranslation();
  const presentation = getBookingStatusPresentation(status);
  const { icon: StatusIcon, palette } = presentation;
  const current = steps.findIndex((step) => step === presentation.status);
  const reached = new Set([status, ...history.map((entry) => entry.status)]);

  return (
    <Entrance key={presentation.status} variant="fade">
      <AppCard>
        <SectionHeader title={t('booking.progress.title')} />
        <View style={[styles.notice, { backgroundColor: palette.surface }]}>
          <StatusIcon size={sizes.icon.md} color={palette.text} />
          <Text style={[typography.supporting, styles.noticeCopy, { color: palette.text }]}>
            {t(presentation.descriptionKey)}
          </Text>
        </View>
        {current >= 0 && (
          <View style={styles.timeline}>
            {steps.map((step, index) => {
              const active = step === 'in_progress' && presentation.status === 'in_progress';
              const done = reached.has(step) && !active;
              const state = active ? 'active' : done ? 'done' : 'upcoming';
              const label = t(`booking.progress.step.${step}`);
              const last = index === steps.length - 1;

              return (
                <View
                  key={step}
                  accessible
                  accessibilityLabel={t('booking.progress.accessibleStep', { label, state: t(`booking.progress.state.${state}`) })}
                  style={styles.step}
                >
                  <View style={styles.rail}>
                    {!last && <View style={[styles.line, done && reached.has(steps[index + 1]) && styles.connected]} />}
                    <View style={[styles.dot, done && styles.done, active && styles.active]}>
                      {done && <Check size={sizes.icon.sm} color={colors.surface} />}
                      {active && <CircleDot size={sizes.icon.sm} color={colors.progressText} />}
                    </View>
                  </View>
                  <Text style={[typography.label, styles.stepLabel, !last && styles.stepSpacing, (done || active) && styles.reachedLabel]}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </AppCard>
    </Entrance>
  );
}

const styles = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.sm, borderRadius: radius.md },
  noticeCopy: { flex: 1, minWidth: 0 },
  timeline: { paddingTop: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.sm },
  rail: { width: sizes.icon.lg, alignItems: 'center' },
  line: {
    position: 'absolute', top: spacing.sm, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: colors.outline,
  },
  connected: { backgroundColor: colors.primary },
  dot: {
    width: sizes.icon.lg, height: sizes.icon.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.outline,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  done: { backgroundColor: colors.deep, borderColor: colors.deep },
  active: { backgroundColor: colors.progressTint, borderColor: colors.progressText },
  stepLabel: { flex: 1, minWidth: 0, color: colors.muted },
  reachedLabel: { color: colors.ink },
  stepSpacing: { paddingBottom: spacing.md },
});
