import { z } from 'zod';

import { fullNameSchema, indianMobileSchema } from '@/types/customerProfile';

function normalizeMobile(value: string) {
  const digits = value
    .replace(/[൦-൯]/g, (digit) => String(digit.charCodeAt(0) - '൦'.charCodeAt(0)))
    .replace(/[\s()-]/g, '');

  return digits.startsWith('+') ? digits : `+91${digits}`;
}

const primaryMobile = z.string().trim()
  .min(1, 'registration.primaryRequired')
  .transform(normalizeMobile)
  .pipe(indianMobileSchema);

const alternateMobile = z.string().trim()
  .transform((value) => value ? normalizeMobile(value) : undefined)
  .pipe(indianMobileSchema.optional());

export const registrationSchema = z.object({
  fullName: fullNameSchema,
  primaryPhone: primaryMobile,
  alternatePhone: alternateMobile,
});

export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationOutput = z.output<typeof registrationSchema>;
