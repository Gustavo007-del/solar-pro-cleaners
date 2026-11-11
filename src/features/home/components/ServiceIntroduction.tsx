import { SolarPanel } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { ServiceCard } from '@/components/surfaces/ContentCards';

export function ServiceIntroduction() {
  const { t } = useTranslation();

  return <ServiceCard icon={SolarPanel} title={t('home.introduction.title')} description={t('home.introduction.description')} />;
}
