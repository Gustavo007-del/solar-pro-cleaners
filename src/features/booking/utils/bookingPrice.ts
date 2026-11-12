// Monetary values stay as decimal strings. The backend computes estimates.
export function displayAmount(amount: string, currency: string) {
  return `${currency} ${amount}`;
}

