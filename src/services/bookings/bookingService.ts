import { randomUUID } from 'expo-crypto';
import { z } from 'zod';

import { readLocalBooking, readLocalCustomerBookings, saveLocalBooking } from '@/services/storage/bookings';
import { bookingRequestSchema, type Booking, type BookingFilter, type BookingRequest } from '@/types/booking';

import { getBookingReference } from './bookingReference';

type BookingService = {
  createBooking: (request: BookingRequest, submissionId: string) => Promise<Booking>;
  getBookingById: (customerId: string, bookingId: string) => Promise<Booking | undefined>;
  getCustomerBookings: (customerId: string) => Promise<Booking[]>;
};

const pendingWrites = new Map<string, Promise<Booking>>();

export function createBookingSubmissionId() {
  return randomUUID();
}

async function persistBooking(request: BookingRequest, id: string): Promise<Booking> {
  const existing = await readLocalBooking(request.customerId, id);
  if (existing) return existing;

  const timestamp = new Date().toISOString();
  const booking: Booking = {
    ...request,
    id,
    reference: getBookingReference(id),
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await saveLocalBooking(booking);
  return booking;
}

async function createLocalBooking(request: BookingRequest, submissionId: string): Promise<Booking> {
  const details = bookingRequestSchema.parse(request);
  const id = z.uuid().parse(submissionId);
  const key = `${details.customerId}/${id}`;
  const pending = pendingWrites.get(key);
  if (pending) return pending;

  const write = persistBooking(details, id);
  pendingWrites.set(key, write);
  try {
    return await write;
  } finally {
    pendingWrites.delete(key);
  }
}

// A remote implementation can use submissionId as an idempotency key and return a server-issued ID.
export const bookingService: BookingService = {
  createBooking: createLocalBooking,
  getBookingById: readLocalBooking,
  getCustomerBookings: readLocalCustomerBookings,
};

export function getBookingsByStatus(bookings: readonly Booking[], filter: BookingFilter) {
  return filter === 'all' ? bookings : bookings.filter((booking) => booking.status === filter);
}

export function getBookingStatistics(bookings: readonly Booking[]) {
  const counts = { total: bookings.length, pending: 0, confirmed: 0, completed: 0 };

  for (const { status } of bookings) {
    if (status === 'pending' || status === 'confirmed' || status === 'completed') counts[status]++;
  }

  return counts;
}
