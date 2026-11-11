import { useRef, useState } from 'react';

import type { CapturedLocation } from '@/services/location/currentLocation';
import type { BookingLocation, ManualBookingAddress } from '@/types/booking';

import type { ManualAddressInput } from '../schemas/addressSchema';

type BookingDraft = {
  captured: CapturedLocation | null;
  manualAddress: ManualBookingAddress | null;
  addressFields: ManualAddressInput | null;
  editingAddress: boolean;
  locationConfirmed: boolean;
  detailsConfirmed: boolean;
  confirmedProfileVersion?: string;
  instructions: string;
  submissionId?: string;
};

const sessionDrafts = new Map<string, BookingDraft>();

export function getSelectedLocation(draft: BookingDraft): BookingLocation | null {
  if (draft.editingAddress) return null;
  const { captured, manualAddress } = draft;

  if (captured && manualAddress) {
    return { method: 'gps', coordinates: captured.coordinates, address: manualAddress, isAddressManuallyEdited: true };
  }
  if (captured?.address) {
    return { method: 'gps', coordinates: captured.coordinates, address: captured.address, isAddressManuallyEdited: false };
  }
  if (manualAddress) {
    return { method: 'manual', coordinates: null, address: manualAddress, isAddressManuallyEdited: false };
  }
  return null;
}

export function useBookingDraft(customerId: string) {
  const [draft, setDraft] = useState<BookingDraft>(() => sessionDrafts.get(customerId) ?? {
    captured: null,
    manualAddress: null,
    addressFields: null,
    editingAddress: false,
    locationConfirmed: false,
    detailsConfirmed: false,
    instructions: '',
  });
  const currentDraft = useRef(draft);

  function updateDraft(change: Partial<BookingDraft>) {
    const next = { ...currentDraft.current, ...change };
    currentDraft.current = next;
    sessionDrafts.set(customerId, next);
    setDraft(next);
    return next;
  }

  function clearDraft(savedDraft: BookingDraft) {
    if (sessionDrafts.get(customerId) === savedDraft) sessionDrafts.delete(customerId);
  }

  return { draft, currentDraft, updateDraft, clearDraft };
}
