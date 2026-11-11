import { SolarPanel } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ServiceCard } from '@/components/surfaces/ContentCards';
import { StatusBadge } from '@/components/surfaces/StatusBadge';

export function BookingServiceCard() {
  const { t } = useTranslation();
  return (
    <ServiceCard
      icon={SolarPanel}
      title={t('booking.service.name')}
      description={t('booking.service.description')}
      footer={<StatusBadge tone="success" label={t('booking.service.category')} />}
    />
  );
}
