import { useRef, useState } from 'react';

import type { CapturedLocation } from '@/services/location/currentLocation';
import { addressPayload, type SavedAddress } from '@/services/api/addresses';
import type { BookingAddressSelection, CreateBookingInput } from '@/services/bookings/bookingService';

type BookingDraft = {
  captured: CapturedLocation | null;
  addressText: string;
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

export function bookingAddressFields(draft: BookingDraft): BookingAddressSelection {
  if (draft.savedAddress) return { saved_address_id: draft.savedAddress.id };
  const { captured } = draft;
  const text = draft.addressText.trim();
  if (captured?.address && text === captured.address.formattedAddress) {
    return { address: addressPayload({ method: 'gps', coordinates: captured.coordinates,
      address: captured.address, isAddressManuallyEdited: false }) };
  }
  if (!text && !captured) return {};
  return { address: {
    address_line: text || null,
    latitude: captured?.coordinates.latitude,
    longitude: captured?.coordinates.longitude,
    location_source: captured ? (text ? 'gps_with_manual_address' : 'gps') : 'manual',
  } };
}

export function useBookingDraft(customerId: string) {
  const [draft, setDraft] = useState<BookingDraft>(() => sessionDrafts.get(customerId) ?? {
    captured: null,
    addressText: '',
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
