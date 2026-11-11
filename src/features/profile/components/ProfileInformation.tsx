import { useTranslation } from 'react-i18next';

import { DetailRows } from '@/components/layout/DetailRows';
import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import type { CustomerProfile } from '@/types/customerProfile';

export function ProfileInformation({ profile, heading = true }: { profile: CustomerProfile; heading?: boolean }) {
  const { t } = useTranslation();
  const rows = [
    { label: t('profile.fullName'), value: profile.fullName },
    { label: t('booking.customer.primaryPhone'), value: profile.primaryPhone },
  ];
  if (profile.alternatePhone) rows.push({ label: t('booking.customer.alternatePhone'), value: profile.alternatePhone });
  rows.push({ label: t('profile.language'), value: t(profile.preferredLanguage === 'ml' ? 'language.malayalam' : 'language.english') });

  return (
    <AppCard>
      {heading && <SectionHeader title={t('profile.accountInformation')} />}
      <DetailRows rows={rows} />
    </AppCard>
  );
}
