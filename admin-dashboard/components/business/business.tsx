'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Details, Field, Heading, Panel, Pager, RecordLink, Refresh, Resource, Table } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { TextFilter, useDebounced } from '@/components/filters';
import { useApi, useFilters } from '@/hooks/use-api';
import { dateText, label, money } from '@/lib/utils';
import { routes } from '@/services/routes';
import type { AvailabilityCheck, Business, Closure, Hours, Page, Price, Service, ServiceArea, ServiceDetail } from '@/types/api';
import { weekdays } from '@/components/technicians/technician-schedule';

export function Services() {
  const filter = useFilters({ search: '' });
  const search = useDebounced(filter.values.search);
  const query = useApi<Page<Service>>(routes.services, { search, page: filter.page });
  return <>
    <Heading title="Services" description="Published services and pricing." actions={<Refresh run={() => void query.refetch()} busy={query.isFetching} />} />
    <Panel title="Service catalogue" description="Read-only · Active services published by FastAPI">
      <div className="toolbar"><TextFilter className="search-field" label="Search" value={filter.values.search}
        onChange={(value) => filter.set('search', value)} placeholder="Service name" /></div>
      <Resource query={query}>{(data) => <><Table rows={data.items} columns={[
        { accessorKey: 'name', header: 'Service', cell: ({ row }) => <RecordLink href={'/services/' + row.original.id}>{row.original.name}</RecordLink> },
        { accessorKey: 'short_description', header: 'Description', cell: ({ row }) => <span className="cell-location">{row.original.short_description}</span> },
        { accessorKey: 'slug', header: 'Slug' }, { id: 'published', header: 'Status', cell: () => <Badge value="active" /> },
      ]} empty="No published services" /><Pager data={data} change={filter.setPage} /></>}</Resource>
    </Panel>
  </>;
}

export function ServiceRecord({ id }: { id: string }) {
  const details = useApi<ServiceDetail>(routes.service(id));
  const pricing = useApi<Price | null>(routes.pricing(id));
  return <Resource query={details}>{(service) => <>
    <Heading title={service.name} description={service.short_description} actions={<Badge value="active" />} />
    <div className="split">
      <Panel title="Service details"><div className="panel-body"><p className="prewrap">{service.description}</p>
        {service.benefits.length > 0 && <ul className="bullets">{service.benefits.map((benefit, index) => <li key={index}>{benefit}</li>)}</ul>}
      </div></Panel>
      <Panel title="Current pricing"><Resource query={pricing}>{(price) => <div className="panel-body">{price ? <Details items={[
        ['Model', label(price.pricing_type)], ['Base price', money(price.base_price, price.currency)],
        ['Per panel', money(price.price_per_panel, price.currency)], ['Minimum charge', money(price.minimum_charge, price.currency)],
      ]} /> : <p className="muted">No price is currently published.</p>}</div>}</Resource></Panel>
    </div>
    <AvailabilityForm serviceId={id} />
  </>}</Resource>;
}

export function ServiceAreas() {
  const [page, setPage] = useState(1);
  const query = useApi<Page<ServiceArea>>(routes.areas, { page });
  return <>
    <Heading title="Service areas" description="Published coverage by locality, district and PIN code." actions={<Refresh run={() => void query.refetch()} busy={query.isFetching} />} />
    <Panel title="Coverage areas" description="Read-only · Active areas">
      <Resource query={query}>{(data) => <><Table rows={data.items} columns={[
        { accessorKey: 'name', header: 'Area' }, { accessorKey: 'match_type', header: 'Coverage type', cell: ({ row }) => label(row.original.match_type) },
        { accessorKey: 'locality', header: 'Locality' }, { accessorKey: 'city', header: 'City' }, { accessorKey: 'district', header: 'District' },
        { accessorKey: 'state', header: 'State' }, { accessorKey: 'postal_code', header: 'PIN code' },
      ]} empty="No published service areas" /><Pager data={data} change={setPage} /></>}</Resource>
    </Panel>
  </>;
}

export function BusinessSettings() {
  const business = useApi<Business>(routes.business);
  return <>
    <Heading title="Business settings" description="Published business information and operating schedule." />
    <Panel title="Business profile" description="Read-only · Published business information">
      <Resource query={business}>{(data) => <div className="panel-body"><Details items={[
        ['Business name', data.business_name], ['Description', data.description], ['Primary phone', data.primary_phone],
        ['Alternate phone', data.alternate_phone], ['WhatsApp', data.whatsapp_number], ['Support email', data.support_email],
        ['Address', [data.business_address, data.city, data.district, data.state, data.postal_code].filter(Boolean).join(', ') || '—'],
        ['Business timezone', data.timezone], ['Website', data.website_url], ['Privacy policy', data.privacy_policy_url],
      ]} /></div>}</Resource>
    </Panel>
    <BusinessSchedule />
  </>;
}

function BusinessSchedule() {
  const [page, setPage] = useState(1);
  const hours = useApi<Hours>(routes.hours);
  const closures = useApi<Page<Closure>>(routes.closures, { page });
  return <div className="split">
    <Panel title="Operating hours" description={hours.data?.timezone}><Resource query={hours}>{(data) =>
      <Table rows={data.days} columns={[
        { id: 'weekday', header: 'Day', cell: ({ row }) => weekdays[row.original.day_of_week] },
        { id: 'hours', header: 'Hours', cell: ({ row }) => row.original.is_open
          ? row.original.opening_time?.slice(0, 5) + '–' + row.original.closing_time?.slice(0, 5) : 'Closed' },
      ]} empty="No operating hours are configured" />}</Resource></Panel>
    <Panel title="Upcoming closures"><Resource query={closures}>{(data) => <><Table rows={data.items} columns={[
      { accessorKey: 'closure_date', header: 'Closure date', cell: ({ row }) => dateText(row.original.closure_date) },
    ]} empty="No upcoming closures" /><Pager data={data} change={setPage} /></>}</Resource></Panel>
  </div>;
}

export function AvailabilityPage() {
  return <><Heading title="Availability" description="Check a requested date against service coverage and operating hours." />
    <AvailabilityForm /><BusinessSchedule /></>;
}

function AvailabilityForm({ serviceId }: { serviceId?: string }) {
  const services = useApi<Page<Service>>(routes.services, { page_size: 100 }, !serviceId);
  const [form, setForm] = useState({ service_id: serviceId ?? '', requested_date: '', postal_code: '', locality: '', city: '', district: '', state: '' });
  const [checked, setChecked] = useState<typeof form>();
  const [error, setError] = useState('');
  const result = useApi<AvailabilityCheck>(routes.availability, checked ?? {}, Boolean(checked));
  function check(event: FormEvent) {
    event.preventDefault();
    if (!form.service_id || !form.requested_date || ![form.postal_code, form.locality, form.city, form.district].some((value) => value.trim())) {
      setError('Choose a service, date and at least one location field.'); return;
    }
    if (form.postal_code && !/^[1-9][0-9]{5}$/.test(form.postal_code.trim())) {
      setError('Enter a six-digit Indian PIN code.'); return;
    }
    setError('');
    const values = { ...form, postal_code: form.postal_code.trim(), locality: form.locality.trim(), city: form.city.trim(), district: form.district.trim(), state: form.state.trim() };
    if (checked && JSON.stringify(checked) === JSON.stringify(values)) void result.refetch();
    else setChecked(values);
  }
  return <Panel title="Check service availability">
    <form className="toolbar" onSubmit={check} noValidate>
      {!serviceId && <Field label="Service"><select value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
        <option value="">Select a service</option>{services.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></Field>}
      <Field label="Requested date"><input type="date" value={form.requested_date} onChange={(e) => setForm({ ...form, requested_date: e.target.value })} /></Field>
      {(['postal_code','locality','city','district','state'] as const).map((key) => <Field key={key} label={key === 'postal_code' ? 'PIN code' : label(key)}>
        <input value={form[key]} maxLength={key === 'postal_code' ? 6 : 120} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </Field>)}
      <Button type="submit">Check availability</Button>
      {error && <span className="field-error" role="alert">{error}</span>}
    </form>
    {checked && <Resource query={result}>{(data) => <div className="panel-body"><Details items={[
      ['Result', <Badge value={data.reason === 'candidate' ? 'available' : data.reason === 'confirmation_required' ? 'pending' : 'unavailable'} text={label(data.reason)} />],
      ['Date', dateText(data.requested_date) + ' · ' + data.timezone], ['Coverage', data.coverage.matched_area_name ?? data.coverage.message], ['Details', data.message],
    ]} /></div>}</Resource>}
  </Panel>;
}

