'use client';

import { MapPin, UserRoundPen } from 'lucide-react';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Badge, Details, Empty, Heading, Pager, Panel, RecordLink, Refresh, Resource, Table } from '@/components/shared';
import { SelectFilter, TextFilter, useDebounced } from '@/components/filters';
import { FormDialog, optional, optionalPhone, options, phoneRule } from '@/components/forms';
import { useAction, useApi, useFilters } from '@/hooks/use-api';
import { dateText, mapsLink } from '@/lib/utils';
import { usePermissions } from '@/providers/app-providers';
import { routes } from '@/services/routes';
import { statuses, type BookingCard, type CustomerCard, type CustomerDetails, type Page } from '@/types/api';
import { bookingColumns } from '@/components/bookings/booking-list';

export const customerColumns: ColumnDef<CustomerCard>[] = [
  { accessorKey: 'full_name', header: 'Customer', cell: ({ row }) => <RecordLink href={'/customers/' + row.original.id}>{row.original.full_name}</RecordLink> },
  { accessorKey: 'phone_number', header: 'Primary phone' },
  { accessorKey: 'alternate_phone_number', header: 'Alternate phone', cell: ({ row }) => row.original.alternate_phone_number ?? '—' },
  { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => <Badge value={row.original.is_active ? 'active' : 'inactive'} /> },
  { accessorKey: 'created_at', header: 'Registered', cell: ({ row }) => dateText(row.original.created_at) },
  { accessorKey: 'total_bookings', header: 'Bookings' },
  { accessorKey: 'last_booking_at', header: 'Latest booking', cell: ({ row }) => dateText(row.original.last_booking_at) },
];

export function Customers() {
  const filter = useFilters({ search: '', sort: 'newest' });
  const search = useDebounced(filter.values.search);
  const query = useApi<Page<CustomerCard>>(routes.customers, { ...filter.values, search, page: filter.page });
  return <>
    <Heading title="Customers" description="Find customers, review their booking history and manage account access."
      actions={<Refresh run={() => void query.refetch()} busy={query.isFetching} />} />
    <Panel title="Customer directory">
      <div className="toolbar">
        <TextFilter className="search-field" label="Search" placeholder="Name or phone prefix" value={filter.values.search} onChange={(v) => filter.set('search', v)} />
        <SelectFilter label="Account status" all="All accounts" value={filter.values.is_active ?? ''} onChange={(v) => filter.set('is_active', v)}
          choices={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} />
        <SelectFilter label="Sort" value={filter.values.sort} onChange={(v) => filter.set('sort', v)} choices={options(['newest', 'oldest', 'name'])} />
        <TextFilter label="Registered from" type="date" value={filter.values.registered_from ?? ''} onChange={(v) => filter.set('registered_from', v)} />
        <TextFilter label="Registered to" type="date" value={filter.values.registered_to ?? ''} onChange={(v) => filter.set('registered_to', v)} />
        <Button variant="ghost" onClick={filter.clear}>Clear filters</Button>
      </div>
      <Resource query={query}>{(data) => <><Table columns={customerColumns} rows={data.items} empty="No customers match these filters" />
        <Pager data={data} change={filter.setPage} /></>}</Resource>
    </Panel>
  </>;
}

export function CustomerRecord({ id }: { id: string }) {
  const { can } = usePermissions();
  const [addressPage, setAddressPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<'profile' | 'activate' | 'deactivate'>();
  const action = useAction();
  const details = useApi<CustomerDetails>(routes.customer(id), { address_page: addressPage });
  const bookings = useApi<Page<BookingCard>>(routes.customerBookings(id), { page: bookingPage, status }, Boolean(details.data));
  return <Resource query={details}>{(data) => {
    const person = data.customer;
    return <>
      <Heading title={person.full_name} description="Customer account and booking activity" actions={<>
        <Badge value={person.is_active ? 'active' : 'inactive'} />
        {can('customers.update') && <Button variant="outline" onClick={() => setEdit('profile')}><UserRoundPen size={16} />Edit profile</Button>}
        {person.is_active && can('customers.deactivate') && <Button variant="outline" onClick={() => setEdit('deactivate')}>Deactivate</Button>}
        {!person.is_active && can('customers.activate') && <Button onClick={() => setEdit('activate')}>Activate</Button>}
      </>} />
      <div className="split">
        <Panel title="Contact details"><div className="panel-body"><Details items={[
          ['Name', person.full_name], ['Primary phone', person.phone_number], ['Alternate phone', person.alternate_phone_number],
          ['Registered', dateText(person.created_at)], ['Last updated', dateText(person.updated_at)],
        ]} /></div></Panel>
        <Panel title="Booking activity"><div className="panel-body"><Details items={[
          ['Total bookings', data.total_bookings], ...statuses.map((value): [string, number] =>
            [value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()), data.booking_status_counts[value]]),
        ]} /></div></Panel>
      </div>
      <Panel title="Saved addresses">
        {data.saved_addresses.items.length ? <div className="address-grid">{data.saved_addresses.items.map((address) => {
          const map = mapsLink(address.google_maps_url);
          return <div className="address-entry" key={address.id}><strong>{address.label ?? 'Saved address'}</strong>
            {address.is_default && <Badge value="active" text="Default" />}
            <p>{[address.address_line, address.address_line_2, address.locality, address.city, address.district, address.state, address.postal_code].filter(Boolean).join(', ')}</p>
            {map && <a className="record-link inline-flex items-center gap-1" href={map} target="_blank" rel="noopener noreferrer"><MapPin size={15} />View map</a>}
          </div>;
        })}</div> : <Empty title="No saved addresses" />}
        <Pager data={data.saved_addresses} change={setAddressPage} />
      </Panel>
      <Panel title="Booking history">
        <div className="toolbar"><SelectFilter label="Status" all="All statuses" value={status} choices={options(statuses)}
          onChange={(value) => { setStatus(value); setBookingPage(1); }} /></div>
        <Resource query={bookings}>{(page) => <><Table rows={page.items} columns={bookingColumns(true)} empty="No bookings match these filters" />
          <Pager data={page} change={setBookingPage} /></>}</Resource>
      </Panel>
      {edit === 'profile' && <FormDialog title="Edit customer profile" close={() => setEdit(undefined)} fields={[
        { name: 'full_name', label: 'Full name', required: true, initial: person.full_name, rule: z.string().trim().min(1).max(100) },
        { name: 'phone_number', label: 'Primary phone', type: 'tel', required: true, initial: person.phone_number, rule: phoneRule },
        { name: 'alternate_phone_number', label: 'Alternate phone', type: 'tel', initial: person.alternate_phone_number ?? '', rule: optionalPhone },
      ]} submit={(values) => action.mutateAsync({ path: routes.customer(id), method: 'PATCH', body: {
        full_name: values.full_name.trim(), phone_number: values.phone_number.trim(), alternate_phone_number: optional(values.alternate_phone_number),
      } })} />}
      {(edit === 'activate' || edit === 'deactivate') && <FormDialog title={edit === 'activate' ? 'Activate customer' : 'Deactivate customer'}
        description={edit === 'deactivate' ? 'This revokes the customer’s sessions. Booking history is retained.' : 'This restores the customer’s ability to sign in.'}
        destructive={edit === 'deactivate'} submitLabel={edit === 'activate' ? 'Activate' : 'Deactivate'} close={() => setEdit(undefined)}
        fields={[{ name: 'reason', label: 'Reason', type: 'select', options: [{ value: '', label: 'Choose a reason (optional)' },
          ...options(['customer_request', 'account_review', 'policy', 'other'])] }]}
        submit={(values) => action.mutateAsync({ path: routes.customerState(id, edit), method: 'POST', body: { reason: optional(values.reason) } })} />}
    </>;
  }}</Resource>;
}

