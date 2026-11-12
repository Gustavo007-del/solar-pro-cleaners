import { z } from 'zod';
import { apiRequest, queryPath } from './client';

export function pageSchema<T>(item: z.ZodType<T>) {
  return z.object({ items: z.array(item), total: z.number().int().nonnegative(),
    page: z.number().int().positive(), page_size: z.number().int().positive(),
    has_next: z.boolean(), has_previous: z.boolean(), total_pages: z.number().int().nonnegative() });
}

const service = z.object({
  id: z.uuid(), name: z.string(), short_description: z.string(), benefits: z.array(z.string()),
});
const serviceDetail = service.extend({ description: z.string() });
export const money = z.string().regex(/^\d+(\.\d+)?$/);
export const pricingType = z.enum(['fixed', 'per_panel', 'custom_quote']);
const price = z.object({
  pricing_type: pricingType, currency: z.string().regex(/^[A-Z]{3}$/),
  base_price: money.nullable().default(null), price_per_panel: money.nullable().default(null),
  minimum_charge: money.nullable().default(null),
});
const business = z.object({
  business_name: z.string(), primary_phone: z.string().nullable(), whatsapp_number: z.string().nullable(),
  support_email: z.string().nullable(), business_address: z.string().nullable(), website_url: z.string().nullable(),
  privacy_policy_url: z.string().nullable(), terms_url: z.string().nullable(), timezone: z.string(),
});
const hours = z.object({ timezone: z.string(), days: z.array(z.object({
  day_of_week: z.number().int().min(0).max(6), is_open: z.boolean(),
  opening_time: z.string().nullable(), closing_time: z.string().nullable(),
})) });
const closures = pageSchema(z.object({ closure_date: z.iso.date() }));
const area = z.object({ id: z.uuid(), name: z.string() });
const coverage = z.object({ covered: z.literal(true).nullable(), message: z.string() });
const availability = z.object({
  service_active: z.boolean(), reason: z.enum(['service_unavailable', 'past_date', 'closure', 'closed', 'confirmation_required', 'candidate']),
  message: z.string(), timezone: z.string(), coverage,
});
export type Service = z.infer<typeof service>;
export type ServicePrice = z.infer<typeof price>;
export type Business = z.infer<typeof business>;
export type CoverageFields = Partial<Record<'postal_code' | 'locality' | 'city' | 'district' | 'state', string | null>>;

const pending = new Map<string, Promise<unknown>>();
function coalesce<T>(key: string, read: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const request = read().finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export const catalogue = {
  services(page = 1) { return coalesce(`services:${page}`, () => apiRequest(queryPath('/services', { page }), pageSchema(service))); },
  service(id: string) {
    return coalesce(`service:${id}`, async () => {
      const [details, pricing] = await Promise.all([
        apiRequest(`/services/${id}`, serviceDetail), apiRequest(`/services/${id}/pricing`, price.nullable()),
      ]);
      return { ...details, pricing };
    });
  },
  areas(page = 1) { return apiRequest(queryPath('/service-areas', { page }), pageSchema(area)); },
  checkArea(fields: CoverageFields) { return apiRequest(queryPath('/service-areas/check', fields), coverage); },
  business() { return coalesce('business', () => apiRequest('/business', business)); },
  hours() { return coalesce('hours', () => apiRequest('/business/operating-hours', hours)); },
  closures(page = 1) { return apiRequest(queryPath('/business/closures', { page }), closures); },
  availability(serviceId: string, date: string, fields: CoverageFields) {
    return apiRequest(queryPath('/availability', { ...fields, service_id: serviceId, requested_date: date }), availability);
  },
};

