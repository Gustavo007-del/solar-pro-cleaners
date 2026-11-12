import { z } from 'zod';

import type { BookingAddress, BookingLocation } from '@/types/booking';
import { pageSchema, type CoverageFields } from './catalogue';
import { queryPath } from './client';
import { customerRequest } from './session';

const coordinate = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?(?:e[+-]?\d+)?$/i).transform(Number)]);
export const addressSnapshot = z.object({
  address_line: z.string(), address_line_2: z.string().nullable(), locality: z.string().nullable(), city: z.string().nullable(),
  district: z.string().nullable(), state: z.string().nullable(), postal_code: z.string().nullable(),
  landmark: z.string().nullable(), latitude: coordinate.pipe(z.number().min(-90).max(90)).nullable(),
  longitude: coordinate.pipe(z.number().min(-180).max(180)).nullable(),
  location_source: z.enum(['gps', 'manual', 'gps_with_manual_address']),
  google_maps_url: z.string().nullable(),
});
const addressListItem = z.object({
  id: z.uuid(), label: z.string().nullable(), address_line: z.string(), is_default: z.boolean(),
});
const addressDetail = addressSnapshot.extend(addressListItem.shape);
const coverage = z.object({
  is_covered: z.boolean(), requires_manual_confirmation: z.boolean(), message: z.string(),
  matched_service_area_name: z.string().nullable(),
});
export type SavedAddress = z.infer<typeof addressDetail>;
export type SavedAddressListItem = z.infer<typeof addressListItem>;
type AddressInput = CoverageFields & {
  address_line: string; landmark?: string | null;
  latitude?: number | null; longitude?: number | null;
  location_source: SavedAddress['location_source'];
};

export function coverageFields(address: BookingAddress): CoverageFields {
  return { postal_code: address.pinCode, locality: address.locality, city: address.city,
    district: address.district, state: address.state };
}

export function addressPayload(location: BookingLocation): AddressInput {
  const address = location.address;
  return {
    ...coverageFields(address), address_line: (location.method === 'manual' || location.isAddressManuallyEdited)
      ? address.houseName ?? address.formattedAddress : address.formattedAddress, landmark: address.landmark,
    latitude: location.coordinates?.latitude ?? null, longitude: location.coordinates?.longitude ?? null,
    location_source: location.method === 'manual' ? 'manual' : location.isAddressManuallyEdited ? 'gps_with_manual_address' : 'gps',
  };
}

export function fromAddress(record: z.infer<typeof addressSnapshot>): BookingLocation {
  const segments = [
    ...record.address_line.split(',').map((part) => part.trim()), record.address_line_2,
    record.locality, record.city, record.district, record.state, record.postal_code,
  ];
  const address = {
    formattedAddress: [...new Set(segments.filter(Boolean))].join(', '),
    houseName: record.address_line, locality: record.locality,
    city: record.city, district: record.district, state: record.state, pinCode: record.postal_code,
    landmark: record.landmark,
  };
  const coordinates = record.latitude !== null && record.longitude !== null
    ? { latitude: record.latitude, longitude: record.longitude } : null;
  return coordinates ? { address, coordinates, method: 'gps', isAddressManuallyEdited: record.location_source === 'gps_with_manual_address' }
    : { address, coordinates: null, method: 'manual', isAddressManuallyEdited: false };
}

const base = '/customers/me/addresses';
export const addresses = {
  list(page = 1) { return customerRequest(queryPath(base, { page }), pageSchema(addressListItem)); },
  read(id: string) { return customerRequest(`${base}/${id}`, addressDetail); },
  create(location: BookingLocation, label?: string) {
    return customerRequest(base, addressDetail, { method: 'POST', body: { ...addressPayload(location), label } });
  },
  update(id: string, location: BookingLocation) {
    return customerRequest(`${base}/${id}`, addressDetail, { method: 'PATCH', body: addressPayload(location) });
  },
  remove(id: string) { return customerRequest(`${base}/${id}`, z.undefined(), { method: 'DELETE' }); },
  makeDefault(id: string) { return customerRequest(`${base}/${id}/default`, addressDetail, { method: 'PUT' }); },
  coverage(location: BookingLocation) {
    return customerRequest('/locations/check-coverage', coverage, { method: 'POST', body: {
      ...coverageFields(location.address), latitude: location.coordinates?.latitude ?? null,
      longitude: location.coordinates?.longitude ?? null,
    } });
  },
};

