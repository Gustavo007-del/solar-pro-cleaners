import type { LocationCoordinates } from '@/types/booking';

export function formatCoordinates({ latitude, longitude }: LocationCoordinates): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
