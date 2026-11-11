import { CalendarCheck, CircleAlert, CircleCheck, CircleX, Clock, Hammer, UserRoundCheck, type LucideIcon } from 'lucide-react-native';

import { colors } from '@/theme';
import { normalizeBookingStatus, type Booking } from '@/types/booking';

const presentation = {
  pending: { icon: Clock, text: colors.warning, surface: colors.warningTint },
  confirmed: { icon: CalendarCheck, text: colors.infoText, surface: colors.infoTint },
  assigned: { icon: UserRoundCheck, text: colors.assignedText, surface: colors.assignedTint },
  in_progress: { icon: Hammer, text: colors.progressText, surface: colors.progressTint },
  completed: { icon: CircleCheck, text: colors.successText, surface: colors.mint },
  cancelled: { icon: CircleX, text: colors.error, surface: colors.errorTint },
  unknown: { icon: CircleAlert, text: colors.muted, surface: colors.disabled },
} satisfies Record<Booking['status'], { icon: LucideIcon; text: string; surface: string }>;

export function getBookingStatusPresentation(value: unknown) {
  const status = normalizeBookingStatus(value);
  const { icon, text, surface } = presentation[status];

  return {
    status,
    icon,
    palette: { text, surface },
    labelKey: `booking.status.${status}` as const,
    descriptionKey: `booking.statusDescription.${status}` as const,
  };
}
