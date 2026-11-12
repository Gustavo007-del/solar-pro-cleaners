import { CalendarDays, MapPin, SolarPanel } from 'lucide-react-native';

export const serviceSteps = [
  { id: 'book', icon: CalendarDays },
  { id: 'share', icon: MapPin },
  { id: 'service', icon: SolarPanel },
] as const;

export const serviceInformation = ['availability', 'booking', 'coordination'] as const;
