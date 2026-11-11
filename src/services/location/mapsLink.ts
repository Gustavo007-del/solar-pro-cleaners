import { openExternalLink } from '@/services/contact/externalLinks';
import type { LocationCoordinates } from '@/types/booking';

export function openCoordinatesInMaps({ latitude, longitude }: LocationCoordinates) {
  return openExternalLink(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
}
