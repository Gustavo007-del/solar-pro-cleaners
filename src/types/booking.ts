import { z } from 'zod';

export const maxBookingInstructions = 500;
export const maxBookingAddressPart = 120;
export const indianPinCodePattern = /^[1-9]\d{5}$/;

export const locationCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const bookingAddressSchema = z.object({
  formattedAddress: z.string().trim().min(1),
  houseName: z.string().nullable(),
  locality: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
  pinCode: z.string().nullable(),
  landmark: z.string().nullable(),
});

const requiredAddressPart = z.string().trim().min(1).max(maxBookingAddressPart);
const manualBookingAddressSchema = bookingAddressSchema.extend({
  houseName: requiredAddressPart,
  locality: requiredAddressPart,
  city: requiredAddressPart,
  district: requiredAddressPart,
  state: requiredAddressPart,
  pinCode: z.string().regex(indianPinCodePattern).nullable(),
  landmark: z.string().trim().max(maxBookingAddressPart).nullable(),
});

export const bookingStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;
const bookingStatusSchema = z.enum(bookingStatuses);

export function normalizeBookingStatus(value: unknown): BookingStatus | 'unknown' {
  const status = bookingStatusSchema.safeParse(value);
  return status.success ? status.data : 'unknown';
}

export type LocationCoordinates = z.infer<typeof locationCoordinatesSchema>;
export type BookingAddress = z.infer<typeof bookingAddressSchema>;
export type ManualBookingAddress = z.infer<typeof manualBookingAddressSchema>;
export type BookingLocation =
  | { method: 'gps'; coordinates: LocationCoordinates; address: BookingAddress; isAddressManuallyEdited: boolean }
  | { method: 'manual'; coordinates: null; address: BookingAddress; isAddressManuallyEdited: false };
export type LocationMethod = BookingLocation['method'];
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingFilter = 'all' | BookingStatus;
export type BookingCardData = {
  id: string;
  reference: string;
  status: BookingStatus | 'unknown';
  serviceName: string;
  serviceDate: string | null;
  estimatedAmount: string | null;
  currency: string;
  createdAt: string;
  addressSummary: string | null;
};
export type Booking = BookingCardData & {
  location: BookingLocation | null;
  customerName: string;
  primaryPhone: string;
  alternatePhone: string | null;
  additionalInstructions: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  coverageMatched: boolean | null;
  pricing: {
    pricing_type: 'fixed' | 'per_panel' | 'custom_quote' | null;
    base_price: string | null;
    price_per_panel: string | null;
    minimum_charge: string | null;
    panel_quantity: number | null;
    currency: string;
  };
  history: { status: BookingStatus | 'unknown'; createdAt: string }[];
};
