'use client';

import Link from 'next/link';
import { ArrowRight, CalendarCheck2, CalendarDays, CircleCheck, Clock3, Sun, Users, Wrench, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge, Failure, Heading, Panel, Resource, Table, RecordLink } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { customerColumns } from '@/components/customers/customers';
import { bookingColumns } from '@/components/bookings/booking-list';
import { useApi } from '@/hooks/use-api';
import { usePermissions } from '@/providers/app-providers';
import { dateText, dayInZone } from '@/lib/utils';
import { routes } from '@/services/routes';
import type { BookingCard, CustomerCard, Page, RecentBooking, Summary, WorkloadCard } from '@/types/api';
import { DateFilter, StatusDistribution, Trends, type DateRange } from './analytics';

export function Kpi({ label, value, icon: Icon, tone = 'green', detail }: {
  label: string; value: number; icon: LucideIcon; tone?: 'green' | 'amber' | 'blue' | 'purple'; detail?: string;
}) {
  return <div className="kpi">
    <span className={'kpi-icon kpi-' + tone}><Icon size={19} /></span>
    <div className="kpi-copy"><p>{label}</p><strong>{value.toLocaleString('en-IN')}</strong>{detail && <small>{detail}</small>}</div>
  </div>;
}

const recentColumns: ColumnDef<RecentBooking>[] = [
  { accessorKey: 'booking_reference', header: 'Reference', cell: ({ row }) => <RecordLink href={'/bookings/' + row.original.id}>{row.original.booking_reference}</RecordLink> },
  { accessorKey: 'service_name', header: 'Service' },
  { accessorKey: 'service_date', header: 'Scheduled for', cell: ({ row }) => row.original.service_date
    ? dateText(row.original.service_date) : 'Date to be confirmed' },
  { accessorKey: 'status', header: 'Status', cell: ({ row }) => <Badge value={row.original.status} /> },
];

export function Overview() {
  const [range, setRange] = useState<DateRange>({});
  const { can } = usePermissions();
  const summary = useApi<Summary>(routes.summary, range);
  const staff = useApi<Page<WorkloadCard>>(routes.workload, { page_size: 1, is_active: true, employment_status: 'active' },
    can('technicians.assignments.read', 'technicians.availability.read'));
  const customers = useApi<Page<CustomerCard>>(routes.customers, { page_size: 5, sort: 'newest' }, can('customers.read'));
  const date = summary.data ? dayInZone(summary.data.timezone) : undefined;
  const upcoming = useApi<Page<BookingCard>>(routes.bookings, { page_size: 5, status: 'confirmed', date_from: date, sort: 'service_date' },
    Boolean(date) && can('bookings.read'));
  const assigned = useApi<Page<BookingCard>>(routes.bookings, { page_size: 5, status: 'assigned', sort: 'updated' },
    can('bookings.read', 'technicians.assignments.read'));

  return <>
    <Heading title="Dashboard" description="Booking activity, customer demand and field operations." />
    <section className="overview-banner">
      <div><span className="overview-mark"><Sun size={20} />Operations overview</span>
        <h2>Service activity</h2>
        {summary.data && <p>{dateText(date)} · {summary.data.timezone}</p>}</div>
      <div className="overview-stats">
        {summary.data && [['Today', summary.data.bookings_today], ['This week', summary.data.bookings_this_week],
          ['This month', summary.data.bookings_this_month]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </section>
    <div className="dashboard-filter"><DateFilter change={setRange} /></div>
    <Resource query={summary}>{(data) => <div className="kpi-grid">
      <Kpi label="Total bookings" value={data.total_bookings} icon={CalendarDays} detail={range.start_date ? 'Selected date range' : 'All time'} />
      <Kpi label="Pending bookings" value={data.booking_counts.pending} icon={Clock3} tone="amber" />
      <Kpi label="Completed bookings" value={data.booking_counts.completed} icon={CircleCheck} tone="blue" />
      <Kpi label="Registered customers" value={data.total_customers} icon={Users} tone="purple" />
      {staff.data && <Kpi label="Active technicians" value={staff.data.total} icon={Wrench} />}
    </div>}</Resource>
    {staff.error && <Panel title="Technician count"><Resource query={staff}>{() => null}</Resource></Panel>}
    {can('dashboard.analytics.read') ? <Trends range={range} /> : <Panel title="Booking status">
      <Resource query={summary}>{(data) => <div className="panel-body"><StatusDistribution counts={data.booking_counts} /></div>}</Resource>
    </Panel>}
    <div className="split">
      {can('bookings.read') && <Panel title="Recent bookings" action={<Button asChild variant="ghost" size="sm"><Link href="/bookings">View bookings <ArrowRight size={15} /></Link></Button>}>
        <Resource query={summary}>{(data) => <Table rows={data.recent_created} columns={recentColumns} empty="No recent bookings" />}</Resource>
      </Panel>}
      {can('bookings.read') && <Panel title="Upcoming confirmed visits" action={<CalendarCheck2 className="panel-icon" size={18} />}>
        {summary.error ? <Failure error={summary.error} retry={() => void summary.refetch()} /> :
          <Resource query={upcoming}>{(data) => <Table rows={data.items} columns={bookingColumns(true)} empty="No upcoming confirmed visits" />}</Resource>}
      </Panel>}
      {can('customers.read') && <Panel title="Recent registrations">
        <Resource query={customers}>{(data) => <Table rows={data.items} columns={customerColumns.filter((column) => 'accessorKey' in column
          && ['full_name', 'created_at', 'total_bookings'].includes(String(column.accessorKey)))} empty="No customer registrations" />}</Resource>
      </Panel>}
      {can('bookings.read', 'technicians.assignments.read') && <Panel title="Recently updated assigned bookings">
        <Resource query={assigned}>{(data) => <Table rows={data.items} columns={bookingColumns().filter((column) =>
          ('accessorKey' in column && ['booking_reference','service_date'].includes(String(column.accessorKey))) || column.id === 'technician')}
          empty="No currently assigned bookings" />}</Resource>
      </Panel>}
    </div>
  </>;
}

