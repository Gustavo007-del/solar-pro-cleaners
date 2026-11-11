import { z } from 'zod';

import { indianPinCodePattern, maxBookingAddressPart, type BookingAddress, type ManualBookingAddress } from '@/types/booking';

const requiredPart = z.string().trim().min(1, 'required').max(maxBookingAddressPart, 'tooLong');

export const manualAddressSchema = z.object({
  houseName: requiredPart,
  locality: requiredPart,
  city: requiredPart,
  district: requiredPart,
  state: requiredPart,
  landmark: z.string().trim().max(maxBookingAddressPart, 'tooLong'),
  pinCode: z.string().trim().refine((value) => value === '' || indianPinCodePattern.test(value), 'invalidPin'),
});

export type ManualAddressInput = z.input<typeof manualAddressSchema>;

export function addressToForm(address?: BookingAddress | null): ManualAddressInput {
  return {
    houseName: address?.houseName ?? '',
    locality: address?.locality ?? '',
    city: address?.city ?? '',
    district: address?.district ?? '',
    state: address?.state ?? '',
    landmark: address?.landmark ?? '',
    pinCode: address?.pinCode && indianPinCodePattern.test(address.pinCode) ? address.pinCode : '',
  };
}

export function formatManualAddress(fields: ManualAddressInput): ManualBookingAddress {
  const { houseName, locality, city, district, state, landmark, pinCode } = fields;
  return {
    houseName, locality, city, district, state,
    landmark: landmark || null,
    pinCode: pinCode || null,
    formattedAddress: [...new Set([houseName, locality, city, district, state, pinCode, landmark].filter(Boolean))].join(', '),
  };
}
