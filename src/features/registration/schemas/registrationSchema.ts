import { z } from 'zod';

import { fullNameSchema, indianMobileSchema, solarCapacityOptions } from '@/types/customerProfile';

function normalizeMobile(value: string) {
  const digits = value
    .replace(/[൦-൯]/g, (digit) => String(digit.charCodeAt(0) - '൦'.charCodeAt(0)))
    .replace(/[\s()-]/g, '');

  if (digits.startsWith('+')) return digits;
  if (digits.length === 14 && digits.startsWith('0091')) return `+${digits.slice(2)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return `+91${digits}`;
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
  solarCompany: z.string().trim().max(100).regex(/^[^\x00-\x1f\x7f]*$/)
    .transform((value) => value || undefined).optional(),
  solarCapacityKv: z.literal(solarCapacityOptions).nullish().transform((value) => value ?? undefined),
});

export type RegistrationInput = z.input<typeof registrationSchema>;
export type RegistrationOutput = z.output<typeof registrationSchema>;
