import { randomUUID } from 'expo-crypto';

import type { AccountDeletionRequest, AccountDeletionService } from '../types/accountDeletion';

export function createAccountDeletionRequest(customerId: string): AccountDeletionRequest {
  return { requestId: randomUUID(), customerId, acknowledgedAt: new Date().toISOString() };
}

// The future adapter must authenticate the request and use the server's actual outcome.
export const accountDeletionService: AccountDeletionService = {
  async submit() {
    return { status: 'unavailable' };
  },
};
