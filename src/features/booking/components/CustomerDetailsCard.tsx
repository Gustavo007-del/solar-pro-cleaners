import { UserRound } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { SectionHeader } from '@/components/layout/Headers';
import { AppCard } from '@/components/surfaces/AppCard';
import { colors, sizes } from '@/theme';

import { DetailRows } from '@/components/layout/DetailRows';

export function CustomerDetailsCard({ details, action }: {
  details: { fullName: string; primaryPhone: string; alternatePhone?: string | null };
  action?: ReactNode;
}) {
  const { t } = useTranslation();
  const rows = [
    { label: t('booking.customer.name'), value: details.fullName },
    { label: t('booking.customer.primaryPhone'), value: details.primaryPhone },
  ];
  if (details.alternatePhone) rows.push({ label: t('booking.customer.alternatePhone'), value: details.alternatePhone });

  return (
    <AppCard>
      <SectionHeader title={t('booking.customer.title')} action={<UserRound size={sizes.icon.md} color={colors.deep} />} />
      <DetailRows rows={rows} />
      {action}
    </AppCard>
  );
}
