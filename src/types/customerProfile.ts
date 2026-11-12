import { z } from 'zod';

export const maxCustomerNameLength = 100;
export const fullNameSchema = z.string().trim()
  .min(1, 'registration.invalidName')
  .max(maxCustomerNameLength, 'registration.nameTooLong')
  .regex(/^[^\x00-\x1f\x7f]+$/, 'registration.invalidName');
export const indianMobileSchema = z.string().regex(/^\+91[6-9]\d{9}$/, 'registration.invalidMobile');

export const customerProfileSchema = z.object({
  customerId: z.uuid(),
  fullName: fullNameSchema,
  primaryPhone: indianMobileSchema,
  alternatePhone: indianMobileSchema.optional(),
  preferredLanguage: z.enum(['en', 'ml']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CustomerProfile = z.infer<typeof customerProfileSchema>;
export type CustomerDetails = Pick<CustomerProfile, 'fullName' | 'primaryPhone' | 'alternatePhone'>;
