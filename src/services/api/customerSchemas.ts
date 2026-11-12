import { z } from 'zod';

const timestamp = z.iso.datetime({ offset: true });
export const accountSchema = z.object({ id: z.uuid(), is_active: z.boolean(), created_at: timestamp, updated_at: timestamp });
export const profileSchema = accountSchema.extend({
  full_name: z.string(), phone_number: z.string(), alternate_phone_number: z.string().nullable(),
});
export const tokensSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  token_type: z.literal('bearer'), expires_in: z.number().positive(), refresh_expires_at: timestamp,
});
export const authSchema = z.object({ customer: profileSchema, tokens: tokensSchema });
export type ServerProfile = z.infer<typeof profileSchema>;
export type Tokens = z.infer<typeof tokensSchema>;

