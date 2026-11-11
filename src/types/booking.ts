import { z } from 'zod';

import { fullNameSchema, indianMobileSchema } from './customerProfile';

export const solarCleaningService = 'solar_panel_cleaning';
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

const bookingLocationSchema = z.union([
  z.object({
    method: z.literal('gps'),
    coordinates: locationCoordinatesSchema,
    address: bookingAddressSchema,
    isAddressManuallyEdited: z.literal(false),
  }),
  z.object({
    method: z.literal('gps'),
    coordinates: locationCoordinatesSchema,
    address: manualBookingAddressSchema,
    isAddressManuallyEdited: z.literal(true),
  }),
  z.object({
    method: z.literal('manual'),
    coordinates: z.null(),
    address: manualBookingAddressSchema,
    isAddressManuallyEdited: z.literal(false),
  }),
]);

export const bookingStatuses = ['pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;
const bookingStatusSchema = z.enum(bookingStatuses);

export function normalizeBookingStatus(value: unknown): BookingStatus | 'unknown' {
  const status = bookingStatusSchema.safeParse(value);
  return status.success ? status.data : 'unknown';
}

export const bookingRequestSchema = z.object({
  customerId: z.uuid(),
  serviceType: z.literal(solarCleaningService),
  customerName: fullNameSchema,
  primaryPhone: indianMobileSchema,
  alternatePhone: indianMobileSchema.nullable(),
  location: bookingLocationSchema,
  additionalInstructions: z.string().trim().max(maxBookingInstructions).nullable(),
});

export const bookingSchema = bookingRequestSchema.extend({
  id: z.uuid(),
  reference: z.string().min(1),
  status: bookingStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const bookingRecordSchema = bookingSchema.extend({
  status: z.unknown().transform(normalizeBookingStatus),
});

export type LocationCoordinates = z.infer<typeof locationCoordinatesSchema>;
export type BookingAddress = z.infer<typeof bookingAddressSchema>;
export type ManualBookingAddress = z.infer<typeof manualBookingAddressSchema>;
export type BookingLocation = z.infer<typeof bookingLocationSchema>;
export type LocationMethod = BookingLocation['method'];
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingFilter = 'all' | BookingStatus;
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
export type Booking = z.infer<typeof bookingRecordSchema>;
