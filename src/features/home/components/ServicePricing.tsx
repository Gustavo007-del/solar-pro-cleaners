import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { displayAmount } from '@/features/booking/utils/bookingPrice';
import type { ServicePrice } from '@/services/api/catalogue';
import { typography } from '@/theme';

export function ServicePricing({ pricing, centered = false }: { pricing: ServicePrice | null; centered?: boolean }) {
  const { t } = useTranslation();
  const amount = (value: string) => displayAmount(value, pricing?.currency ?? '');
  const label = !pricing ? t('integration.priceUnknown')
    : pricing.pricing_type === 'custom_quote' ? t('integration.quote')
    : pricing.pricing_type === 'per_panel' && pricing.price_per_panel !== null
      ? t('integration.perPanel', { amount: amount(pricing.price_per_panel) })
      : pricing.base_price !== null ? amount(pricing.base_price) : t('integration.priceUnknown');
  return <>
    <Text style={[typography.label, centered && styles.centered]}>{label}</Text>
    {pricing?.minimum_charge != null && <Text style={[typography.supporting, centered && styles.centered]}>
      {t('integration.minimum', { amount: amount(pricing.minimum_charge) })}
    </Text>}
  </>;
}

const styles = StyleSheet.create({
  centered: { textAlign: 'center' },
});

