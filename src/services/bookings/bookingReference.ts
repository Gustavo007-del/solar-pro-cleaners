export function getBookingReference(bookingId: string): string {
  return `SC-${bookingId.replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}
