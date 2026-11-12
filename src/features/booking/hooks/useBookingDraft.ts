import { useRef, useState } from 'react';

import type { CapturedLocation } from '@/services/location/currentLocation';
import { fromAddress, type SavedAddress } from '@/services/api/addresses';
import type { CreateBookingInput } from '@/services/bookings/bookingService';
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
  serviceId?: string;
  serviceDate?: string;
  panelQuantity?: string;
  savedAddress?: SavedAddress;
  submission?: { id: string; request: CreateBookingInput };
};

const sessionDrafts = new Map<string, BookingDraft>();

export function clearBookingDraft(customerId: string) {
  sessionDrafts.delete(customerId);
}

export function getSelectedLocation(draft: BookingDraft): BookingLocation | null {
  if (draft.editingAddress) return null;
  if (draft.savedAddress) return fromAddress(draft.savedAddress);
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
