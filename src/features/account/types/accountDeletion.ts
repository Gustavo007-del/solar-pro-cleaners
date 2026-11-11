export type AccountDeletionRequest = {
  requestId: string;
  customerId: string;
  acknowledgedAt: string;
};

export type AccountDeletionOutcome =
  | { status: 'unavailable' | 'failed' }
  | { status: 'submitted' | 'pending' | 'completed'; requestId: string };

export type AccountDeletionService = {
  submit: (request: AccountDeletionRequest) => Promise<AccountDeletionOutcome>;
};
