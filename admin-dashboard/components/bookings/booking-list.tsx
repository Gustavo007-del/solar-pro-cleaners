'use client';

import { useSearchParams } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarDays, ClipboardList } from 'lucide-react';
import { Heading, Badge, Table, Panel, Pager, Resource, Refresh, RecordLink } from '@/components/shared';
import { SelectFilter, TextFilter, useDebounced } from '@/components/filters';
import { options } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { useApi, useFilters } from '@/hooks/use-api';
import { usePermissions } from '@/providers/app-providers';
import { dateText, money } from '@/lib/utils';
import { routes } from '@/services/routes';
import { statuses, type BookingCard, type Page, type Service, type TechnicianCard } from '@/types/api';

export function bookingColumns(compact = false): ColumnDef<BookingCard>[] {
  const main: ColumnDef<BookingCard>[] = [
    { accessorKey: 'booking_reference', header: 'Reference', cell: ({ row }) => <RecordLink href={'/bookings/' + row.original.id}>{row.original.booking_reference}</RecordLink> },
    { accessorKey: 'service_name', header: 'Service' },
    { accessorKey: 'service_date', header: 'Service date', cell: ({ row }) => row.original.service_date
      ? dateText(row.original.service_date) : 'Date to be confirmed' },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge value={row.original.status} /> },
  ];
  if (compact) return main;
  return [main[0],
    { accessorKey: 'customer_name', header: 'Customer', cell: ({ row }) => <div><div className="strong">{row.original.customer_name ?? '—'}</div>
      <small className="muted">{row.original.customer_phone ?? ''}</small></div> },
    main[1], main[2],
    { accessorKey: 'address_summary', header: 'Location', cell: ({ row }) => <span className="cell-location" title={row.original.address_summary ?? undefined}>
      {row.original.address_summary ?? 'Location to be confirmed'}</span> },
    { accessorKey: 'estimated_amount', header: 'Estimate', cell: ({ row }) => money(row.original.estimated_amount, row.original.currency) },
    main[3],
    { id: 'technician', header: 'Technician', cell: ({ row }) => row.original.current_assignment ? <div>
      <div>{row.original.current_assignment.technician_name}</div>
      <Badge value={row.original.current_assignment.assignment_status} />
    </div> : '—' },
    { accessorKey: 'created_at', header: 'Created', cell: ({ row }) => dateText(row.original.created_at) },
  ];
}

export function BookingList({ assignments = false }: { assignments?: boolean }) {
  const search = useSearchParams().get('q')?.slice(0, 120) ?? '';
  return <BookingListContent key={search + String(assignments)} search={search} assignments={assignments} />;
}

function BookingListContent({ search, assignments }: { search: string; assignments: boolean }) {
  const { can } = usePermissions();
  const filter = useFilters({ search, status: assignments ? 'confirmed' : '', sort: 'newest' });
  const { values, set, page } = filter;
  const phrase = useDebounced(values.search ?? '');
  const customers = useDebounced(values.customer_name ?? '');
  const phone = useDebounced(values.customer_phone ?? '');
  const services = useApi<Page<Service>>(routes.services, { page_size: 100 }, can('services.read'));
  const technicians = useApi<Page<TechnicianCard>>(routes.technicians, { page_size: 100, sort: 'name' }, can('technicians.read'));
  const query = useApi<Page<BookingCard>>(routes.bookings, { ...values, search: phrase, customer_name: customers, customer_phone: phone, page });
  const Icon = assignments ? ClipboardList : CalendarDays;
  return <>
    <Heading title={assignments ? 'Assignments' : 'Bookings'}
      description={assignments ? 'Find bookings ready for assignment and review active technicians.' : 'Review requests, manage status and coordinate field work.'}
      actions={<Refresh run={() => void query.refetch()} busy={query.isFetching} />} />
    <Panel title={assignments ? 'Assignment queue' : 'Booking register'} action={<Icon size={19} className="panel-icon" />}>
      <div className="toolbar">
        <TextFilter className="search-field" label="Search" placeholder="Reference, name or phone" value={values.search} onChange={(v) => set('search', v)} />
        <SelectFilter label="Status" value={values.status} onChange={(v) => set('status', v)} all="All statuses" choices={options(statuses)} />
        {can('services.read') && <SelectFilter label="Service" value={values.service_id ?? ''} onChange={(v) => set('service_id', v)}
          all="All services" choices={services.data?.items.map((item) => ({ value: item.id, label: item.name })) ?? []} />}
        {can('technicians.read') && <SelectFilter label="Technician" value={values.technician_id ?? ''} onChange={(v) => set('technician_id', v)}
          all="All technicians" choices={technicians.data?.items.map((item) => ({ value: item.id, label: item.full_name })) ?? []} />}
        <SelectFilter label="Sort" value={values.sort} onChange={(v) => set('sort', v)}
          choices={options(['newest', 'oldest', 'service_date', 'updated'])} />
        <Button variant="ghost" onClick={filter.clear}>Clear filters</Button>
      </div>
      <details className="filter-disclosure"><summary>More filters</summary><div className="toolbar">
        <TextFilter label="Customer name" value={values.customer_name ?? ''} onChange={(v) => set('customer_name', v)} />
        <TextFilter label="Customer phone" value={values.customer_phone ?? ''} onChange={(v) => set('customer_phone', v)} />
        <TextFilter label="Service date from" type="date" value={values.date_from ?? ''} onChange={(v) => set('date_from', v)} />
        <TextFilter label="Service date to" type="date" value={values.date_to ?? ''} onChange={(v) => set('date_to', v)} />
        <TextFilter label="City" value={values.city ?? ''} onChange={(v) => set('city', v)} />
      </div></details>
      <Resource query={query}>{(data) => <>
        <Table rows={data.items} columns={bookingColumns()} empty="No bookings match these filters" />
        <Pager data={data} change={filter.setPage} />
      </>}</Resource>
    </Panel>
  </>;
}

