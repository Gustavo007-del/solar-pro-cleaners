import { CalendarDays, Headset, MapPin, Smartphone, SolarPanel, Sparkles } from 'lucide-react-native';

export const serviceBenefits = [
  { id: 'cleaning', icon: Sparkles },
  { id: 'booking', icon: Smartphone },
  { id: 'location', icon: MapPin },
  { id: 'assistance', icon: Headset },
] as const;

export const serviceSteps = [
  { id: 'book', icon: CalendarDays },
  { id: 'share', icon: MapPin },
  { id: 'service', icon: SolarPanel },
] as const;

export const serviceInformation = ['service', 'availability', 'booking', 'coordination'] as const;
