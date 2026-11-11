import { reverseGeocodeAsync, type LocationGeocodedAddress } from 'expo-location';

import type { BookingAddress, LocationCoordinates } from '@/types/booking';

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function joinAddress(parts: readonly (string | null)[]) {
  return [...new Set(parts.filter((part): part is string => Boolean(part)))].join(', ');
}

function toBookingAddress(result: LocationGeocodedAddress): BookingAddress | null {
  const street = [clean(result.streetNumber), clean(result.street)].filter(Boolean).join(' ');
  const houseName = street || clean(result.name);
  const locality = clean(result.district);
  const city = clean(result.city);
  const district = clean(result.subregion);
  const state = clean(result.region);
  const pinCode = clean(result.postalCode);
  const formatted = clean(result.formattedAddress);
  if (!formatted && !houseName && !locality) return null;

  return {
    formattedAddress: formatted ?? joinAddress([houseName, locality, city, district, state, pinCode, clean(result.country)]),
    houseName, locality, city, district, state, pinCode, landmark: null,
  };
}

export async function getAddressFromCoordinates(coordinates: LocationCoordinates): Promise<BookingAddress | null> {
  const [result] = await reverseGeocodeAsync(coordinates);
  return result ? toBookingAddress(result) : null;
}
