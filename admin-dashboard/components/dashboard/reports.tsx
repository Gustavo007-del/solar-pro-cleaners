'use client';

import { useState } from 'react';
import { CalendarDays, UserRoundPlus, Users } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Empty, Heading, Panel, Pager, Resource, RecordLink, Table } from '@/components/shared';
import { SelectFilter, TextFilter, useDebounced } from '@/components/filters';
import { options } from '@/components/forms';
import { bookingColumns } from '@/components/bookings/booking-list';
import { customerColumns } from '@/components/customers/customers';
import { useApi, useFilters } from '@/hooks/use-api';
import { routes } from '@/services/routes';
import { statuses, type BookingCard, type CustomerCard, type Page, type Service, type Summary, type WorkloadCard } from '@/types/api';
import { DateFilter, Trends, type DateRange } from './analytics';
import { Kpi } from './overview';

export function BookingReports() {
  const [range, setRange] = useState<DateRange>({});
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const services = useApi<Page<Service>>(routes.services, { page_size: 100 });
  const bookings = useApi<Page<BookingCard>>(routes.bookings, {
    service_id: service, status, created_from: range.start_date, created_to: range.end_date, page,
  });
  return <>
    <Heading title="Booking reports" description="Review booking volume and completion by reporting period." />
    <DateFilter change={(next) => { setRange(next); setPage(1); }} />
    <Trends range={range} report />
    <Panel title="Bookings by service" description="Filter the register by service to see its booking total and records.">
      <div className="toolbar">
        <SelectFilter label="Service" value={service} all="All services" onChange={(value) => { setService(value); setPage(1); }}
          choices={services.data?.items.map((item) => ({ value: item.id, label: item.name })) ?? []} />
        <SelectFilter label="Status" value={status} all="All statuses" onChange={(value) => { setStatus(value); setPage(1); }} choices={options(statuses)} />
      </div>
      <Resource query={bookings}>{(data) => <><Table rows={data.items} columns={bookingColumns(true)} empty="No bookings in this view" />
        <Pager data={data} change={setPage} /></>}</Resource>
    </Panel>
  </>;
}

export function CustomerReports() {
  const [range, setRange] = useState<DateRange>({});
  const [page, setPage] = useState(1);
  const summary = useApi<Summary>(routes.summary, range);
  const customers = useApi<Page<CustomerCard>>(routes.customers, {
    registered_from: range.start_date, registered_to: range.end_date, sort: 'newest', page,
  });
  return <>
    <Heading title="Customer reports" description="Review registrations and customer booking activity." />
    <DateFilter limit={false} change={(next) => { setRange(next); setPage(1); }} />
    <Resource query={summary}>{(data) => <div className="kpi-grid">
      <Kpi label="Registered customers" value={data.total_customers} icon={Users} detail="All time" />
      <Kpi label="New registrations" value={data.new_customers} icon={UserRoundPlus} tone="blue" detail={range.start_date ? 'Selected date range' : 'Last 30 days'} />
      <Kpi label="Bookings" value={data.total_bookings} icon={CalendarDays} tone="purple" detail={range.start_date ? 'Selected date range' : 'All time'} />
    </div>}</Resource>
    <Panel title="Registration and booking activity" description="Booking counts are lifetime totals for each customer.">
      <Resource query={customers}>{(data) => <><Table rows={data.items} columns={customerColumns} empty="No registrations in this view" />
        <Pager data={data} change={setPage} /></>}</Resource>
    </Panel>
  </>;
}

export function TechnicianReports() {
  const [range, setRange] = useState<DateRange>({});
  const filter = useFilters({ search: '' });
  const search = useDebounced(filter.values.search);
  const query = useApi<Page<WorkloadCard>>(routes.workload, {
    search, date_from: range.start_date, date_to: range.end_date, page: filter.page, page_size: 10, sort: 'name',
  });
  return <>
    <Heading title="Technician performance" description="Assignment workload and outcomes by service date." />
    <DateFilter limit={false} change={(next) => { setRange(next); filter.setPage(1); }} />
    <Panel title="Technician workload">
      <div className="toolbar"><TextFilter label="Search technician" value={filter.values.search} onChange={(value) => filter.set('search', value)}
        placeholder="Name or phone" /></div>
      <Resource query={query}>{(data) => <>
        {data.items.some((item) => item.workload.active_assignments || item.workload.completed_assignments)
          ? <div className="chart panel-body" role="img" aria-label="Active and completed assignment counts for technicians on this page">
            <ResponsiveContainer width="100%" height={240}><BarChart data={data.items} margin={{ left: -15 }}>
              <CartesianGrid vertical={false} stroke="#e8efea" />
              <XAxis dataKey="full_name" axisLine={false} tickLine={false} minTickGap={12} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11 }} /><Tooltip />
              <Bar dataKey="workload.active_assignments" name="Active" fill="#78ae9a" radius={[4,4,0,0]} />
              <Bar dataKey="workload.completed_assignments" name="Completed" fill="#236849" radius={[4,4,0,0]} />
            </BarChart></ResponsiveContainer>
          </div> : <Empty title="No active or completed assignments on this page" />}
        <Table rows={data.items} columns={[
          { accessorKey: 'full_name', header: 'Technician', cell: ({ row }) => <RecordLink href={'/technicians/' + row.original.id}>{row.original.full_name}</RecordLink> },
          { id: 'availability', header: 'Availability now', cell: ({ row }) => <Badge value={row.original.availability.status} /> },
          { id: 'active', header: 'Active', cell: ({ row }) => row.original.workload.active_assignments },
          { id: 'completed', header: 'Completed', cell: ({ row }) => row.original.workload.completed_assignments },
          { id: 'rejected', header: 'Rejected', cell: ({ row }) => row.original.workload.rejected_assignments },
          { id: 'cancelled', header: 'Cancelled', cell: ({ row }) => row.original.workload.cancelled_assignments },
        ]} /><Pager data={data} change={filter.setPage} />
      </>}</Resource>
    </Panel>
  </>;
}

