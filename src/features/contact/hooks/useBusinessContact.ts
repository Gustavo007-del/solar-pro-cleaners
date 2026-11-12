import { useState } from 'react';
import { appConfig } from '@/constants/config';
import { useBookingResource } from '@/features/booking/hooks/useBookingResource';
import { catalogue } from '@/services/api/catalogue';
import { getWebUrl, normalizeInternationalPhone, openPhoneDialer, openWhatsAppChat } from '@/services/contact/externalLinks';
import type { BusinessContactAction } from '@/services/contact/businessContact';

export function useBusinessContact() {
  const resource = useBookingResource('business', catalogue.business);
  const data = resource.failed ? undefined : resource.data;
  const [failedAction, setFailedAction] = useState<BusinessContactAction>();
  const phone = normalizeInternationalPhone(data?.primary_phone ?? undefined) ?? appConfig.business.supportPhone;
  const whatsapp = normalizeInternationalPhone(data?.whatsapp_number ?? undefined) ?? appConfig.business.supportPhone;
  const businessContact = {
    name: data?.business_name, phone, whatsapp,
    email: data?.support_email, address: data?.business_address, website: getWebUrl(data?.website_url ?? undefined),
  };

  async function openContact(action: BusinessContactAction) {
    setFailedAction(undefined);
    const result = await (action === 'call' ? openPhoneDialer(phone) : openWhatsAppChat(whatsapp));
    if (result !== 'opened') setFailedAction(action);
  }

  return { businessContact, resource, failedAction, openContact };
}
