import { useTranslation } from 'react-i18next';

import { Entrance } from '@/components/motion/Entrance';
import { StatusBadge } from '@/components/surfaces/StatusBadge';
import type { Booking } from '@/types/booking';

import { getBookingStatusPresentation } from '../utils/bookingStatus';

export function BookingStatusBadge({ status, animated = true }: { status: Booking['status']; animated?: boolean }) {
  const { t } = useTranslation();
  const item = getBookingStatusPresentation(status);

  const badge = <StatusBadge label={t(item.labelKey)} palette={item.palette} icon={item.icon} />;
  return animated ? <Entrance key={item.status} variant="fade">{badge}</Entrance> : badge;
}
