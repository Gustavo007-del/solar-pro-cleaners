import type { UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/services/api/client';
import type { RegistrationInput } from './registrationSchema';

const fields = {
  full_name: 'fullName',
  phone_number: 'primaryPhone',
  alternate_phone_number: 'alternatePhone',
} as const;

export function applyProfileValidation(error: unknown, setError: UseFormSetError<RegistrationInput>) {
  if (!(error instanceof ApiError) || error.status !== 422) return;
  for (const field of error.fields) {
    if (field === 'full_name' || field === 'phone_number' || field === 'alternate_phone_number') {
      setError(fields[field], { type: 'server' });
    }
  }
}

