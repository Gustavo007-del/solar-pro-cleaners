import { useState } from 'react';

import { type BusinessContactAction, openBusinessContact } from '@/services/contact/businessContact';

export function useBusinessContact() {
  const [failedAction, setFailedAction] = useState<BusinessContactAction>();

  async function openContact(action: BusinessContactAction) {
    setFailedAction(undefined);
    const result = await openBusinessContact(action);
    if (result !== 'opened') setFailedAction(action);
  }

  return { failedAction, openContact };
}
