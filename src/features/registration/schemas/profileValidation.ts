import type { UseFormSetError } from 'react-hook-form';

import { ApiError } from '@/services/api/client';
import type { RegistrationInput } from './registrationSchema';

const fields = {
  full_name: 'fullName',
  phone_number: 'primaryPhone',
  alternate_phone_number: 'alternatePhone',
  solar_company: 'solarCompany',
  solar_capacity_kv: 'solarCapacityKv',
} as const;

export function applyProfileValidation(error: unknown, setError: UseFormSetError<RegistrationInput>) {
  if (!(error instanceof ApiError) || error.status !== 422) return;
  for (const field of error.fields) {
    if (Object.hasOwn(fields, field)) {
      setError(fields[field as keyof typeof fields], { type: 'server' });
    }
  }
}

