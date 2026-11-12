import { z } from 'zod';

import { addressSnapshot, fromAddress, addressPayload } from '@/services/api/addresses';
import { money, pageSchema, pricingType } from '@/services/api/catalogue';
import { ApiError, queryPath } from '@/services/api/client';
import { customerRequest } from '@/services/api/session';
import { bookingStatuses, normalizeBookingStatus, type Booking, type BookingCardData, type BookingFilter } from '@/types/booking';

const timestamp = z.iso.datetime({ offset: true });
const card = z.object({
  id: z.uuid(), booking_reference: z.string(), status: z.string(), service_name: z.string(),
  service_date: z.iso.date().nullable(), estimated_amount: money.nullable(), currency: z.string().regex(/^[A-Z]{3}$/),
  created_at: timestamp, address_summary: z.string().nullable(),
});
const details = card.extend({
  customer: z.object({ full_name: z.string(), phone_number: z.string(), alternate_phone_number: z.string().nullable() }),
  address: addressSnapshot.extend({ address_line: z.string().nullable() }).nullable(),
  customer_instructions: z.string().nullable(), cancellation_reason: z.string().nullable(),
  cancelled_at: timestamp.nullable(), updated_at: timestamp,
  pricing: z.object({
    pricing_type: pricingType.nullable(), base_price: money.nullable(), price_per_panel: money.nullable(),
    minimum_charge: money.nullable(), panel_quantity: z.number().int().positive().nullable(), currency: z.string(),
  }),
  coverage_matched: z.boolean().nullable(),
  history: z.array(z.object({ new_status: z.string(), created_at: timestamp })),
});
const historyPage = pageSchema(card).extend({
  status_counts: z.record(z.enum(bookingStatuses), z.number().int().nonnegative()).nullable().optional(),
});

export type BookingAddressSelection =
  | { address?: Omit<ReturnType<typeof addressPayload>, 'address_line'> & { address_line: string | null }; saved_address_id?: never }
  | { saved_address_id: string; address?: never };

export type CreateBookingInput = BookingAddressSelection & {
  service_id: string; service_date?: string; pricing: { panel_quantity?: number }; customer_instructions: string | null;
};

function toCard(item: z.infer<typeof card>): BookingCardData {
  return {
    id: item.id, reference: item.booking_reference, status: normalizeBookingStatus(item.status),
    serviceName: item.service_name, serviceDate: item.service_date, estimatedAmount: item.estimated_amount,
    currency: item.currency, createdAt: item.created_at, addressSummary: item.address_summary,
  };
}

function toBooking(item: z.infer<typeof details>): Booking {
  return {
    ...toCard(item), location: item.address ? fromAddress(item.address) : null, customerName: item.customer.full_name,
    primaryPhone: item.customer.phone_number, alternatePhone: item.customer.alternate_phone_number,
    additionalInstructions: item.customer_instructions, cancellationReason: item.cancellation_reason,
    cancelledAt: item.cancelled_at, updatedAt: item.updated_at,
    pricing: item.pricing, coverageMatched: item.coverage_matched,
    history: item.history.map((event) => ({ status: normalizeBookingStatus(event.new_status), createdAt: event.created_at })),
  };
}

let receipt: { customerId: string; booking: Booking; expiresAt: number } | undefined;

export function rememberBookingReceipt(customerId: string, booking: Booking) {
  receipt = { customerId, booking, expiresAt: Date.now() + 60_000 };
}

export function readBookingReceipt(customerId: string, id: string) {
  if (receipt && receipt.expiresAt <= Date.now()) receipt = undefined;
  return receipt?.customerId === customerId && receipt.booking.id === id ? receipt.booking : undefined;
}

export function clearBookingReceipt(customerId: string) {
  if (receipt?.customerId === customerId) receipt = undefined;
}

export const bookingService = {
  async createBooking(request: CreateBookingInput, idempotencyKey: string) {
    return toBooking(await customerRequest('/bookings', details, { method: 'POST', body: request, idempotencyKey }));
  },
  async getBookingById(id: string) {
    if (!z.uuid().safeParse(id).success) return undefined;
    try { return toBooking(await customerRequest(`/bookings/${id}`, details)); }
    catch (error) { if (error instanceof ApiError && error.status === 404) return undefined; throw error; }
  },
  async list(filter: BookingFilter, page: number) {
    const result = await customerRequest(queryPath('/bookings/my', { page, status: filter === 'all' ? undefined : filter }), historyPage);
    return { ...result, items: result.items.map(toCard) };
  },
  async cancel(id: string) {
    return toBooking(await customerRequest(`/bookings/${id}/cancel`, details, { method: 'POST' }));
  },
};
