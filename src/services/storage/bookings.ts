import AsyncStorage from '@react-native-async-storage/async-storage';

import { appConfig } from '@/constants/config';
import { bookingRecordSchema, bookingSchema, type Booking } from '@/types/booking';

function customerPrefix(customerId: string) {
  return `${appConfig.storage.bookingPrefix}${customerId}/`;
}

function parseBooking(raw: string | null, customerId: string, bookingId: string): Booking | undefined {
  if (!raw) return undefined;

  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const parsed = bookingRecordSchema.safeParse(record);
  if (parsed.success && parsed.data.customerId === customerId && parsed.data.id === bookingId) return parsed.data;
  return undefined;
}

export function saveLocalBooking(booking: Booking) {
  const record = bookingSchema.parse(booking);
  return AsyncStorage.setItem(`${customerPrefix(record.customerId)}${record.id}`, JSON.stringify(record));
}

export async function readLocalBooking(customerId: string, bookingId: string) {
  const raw = await AsyncStorage.getItem(`${customerPrefix(customerId)}${bookingId}`);
  return parseBooking(raw, customerId, bookingId);
}

export async function readLocalCustomerBookings(customerId: string): Promise<Booking[]> {
  const prefix = customerPrefix(customerId);
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
  if (keys.length === 0) return [];

  const rows = await AsyncStorage.multiGet(keys);
  const bookings = rows.flatMap(([key, raw]) => {
    const booking = parseBooking(raw, customerId, key.slice(prefix.length));
    return booking ? [booking] : [];
  });

  return bookings.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}
