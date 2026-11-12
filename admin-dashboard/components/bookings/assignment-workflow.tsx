'use client';

import { useState } from 'react';
import { FormDialog, noteRule, optional, options } from '@/components/forms';
import { TextFilter, useDebounced } from '@/components/filters';
import { Badge, Pager, Resource, Table, RecordLink } from '@/components/shared';
import { useApi, useAction } from '@/hooks/use-api';
import { usePermissions } from '@/providers/app-providers';
import { dateText, label } from '@/lib/utils';
import { routes } from '@/services/routes';
import type { Assignment, Booking, Candidates, Page, Technician } from '@/types/api';

export const assignmentColumns = [
  { accessorKey: 'booking_reference', header: 'Booking', cell: ({ row }: { row: { original: Assignment } }) =>
    <RecordLink href={'/bookings/' + row.original.booking_id}>{row.original.booking_reference}</RecordLink> },
  { accessorKey: 'technician_name', header: 'Technician' },
  { accessorKey: 'assignment_status', header: 'Status', cell: ({ row }: { row: { original: Assignment } }) => <Badge value={row.original.assignment_status} /> },
  { accessorKey: 'service_date', header: 'Service date', cell: ({ row }: { row: { original: Assignment } }) => dateText(row.original.service_date) },
  { accessorKey: 'assigned_at', header: 'Assigned on', cell: ({ row }: { row: { original: Assignment } }) => dateText(row.original.assigned_at) },
  { accessorKey: 'ended_at', header: 'Ended on', cell: ({ row }: { row: { original: Assignment } }) => dateText(row.original.ended_at) },
  { id: 'reason', header: 'Reason', cell: ({ row }: { row: { original: Assignment } }) =>
    row.original.reassignment_reason ?? row.original.cancellation_reason ?? '—' },
];

export function AssignmentTable({ path }: { path: string }) {
  const [page, setPage] = useState(1);
  const query = useApi<Page<Assignment>>(path, { page });
  return <Resource query={query}>{(data) => <><Table columns={assignmentColumns} rows={data.items} empty="No assignments recorded" />
    <Pager data={data} change={setPage} /></>}</Resource>;
}

type Mode = 'assign' | 'reassign' | 'unassign';
export function AssignmentDialog({ booking, mode, close }: { booking: Booking; mode: Mode; close: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const phrase = useDebounced(search);
  const [selected, setSelected] = useState('');
  const { can } = usePermissions();
  const action = useAction();
  const candidates = useApi<Candidates>(routes.eligible(booking.id), { mode, search: phrase, page }, mode !== 'unassign');
  const workload = useApi<Technician>(routes.technician(selected), {}, Boolean(selected)
    && can('technicians.read', 'technicians.availability.read', 'technicians.assignments.read'));
  const override = mode === 'unassign' ? booking.status === 'in_progress' : candidates.data?.requires_in_progress_override === true;

  if (mode === 'unassign') return <FormDialog title="Unassign technician" description="The booking returns to Confirmed and the assignment is kept in history."
    fields={[
      { name: 'reason', label: 'Reason', type: 'textarea', rule: noteRule, required: override },
      ...(override ? [{ name: 'override', label: 'Work has started', type: 'select' as const, options: options(['no', 'yes']), initial: 'no' }] : []),
    ]} close={close} destructive submitLabel="Unassign technician"
    validate={(values) => override && values.override !== 'yes' ? 'Explicitly approve removing an in-progress assignment.' : undefined}
    submit={(values) => action.mutateAsync({ path: routes.assignmentAction(booking.id, mode), method: 'POST',
      body: { reason: optional(values.reason), allow_in_progress: override && values.override === 'yes' } })} />;

  return <FormDialog title={label(mode) + ' technician'} description="Availability is checked again when you save."
    onValue={(field, value) => { if (field === 'technician') setSelected(value); }}
    extra={<div className="stack">
      <TextFilter label="Search available technicians" value={search} onChange={(value) => { setSearch(value); setPage(1); }} />
      <Resource query={candidates}>{(data) => <>
        <p className="muted small">{data.total} eligible · {dateText(data.service_date)} · {data.timezone}</p>
        {data.total > data.page_size && <Pager data={data} change={setPage} />}
      </>}</Resource>
      {workload.data && <p className="muted small">{workload.data.full_name} · {workload.data.workload.active_assignments} active · {workload.data.workload.completed_assignments} completed</p>}
    </div>}
    close={close} submitLabel={label(mode) + ' technician'}
    fields={[
      { name: 'technician', label: 'Technician', type: 'select', required: true, options: [{ value: '', label: 'Select an eligible technician' },
        ...(candidates.data?.items ?? []).map((item) => ({ value: item.id, label: [
          item.full_name, item.city, item.start_time && item.end_time ? item.start_time.slice(0, 5) + '–' + item.end_time.slice(0, 5) : null,
        ].filter(Boolean).join(' · ') }))] },
      ...(mode === 'reassign' ? [{ name: 'reason', label: 'Reason for reassignment', type: 'textarea' as const, rule: noteRule, required: true }] : []),
      { name: 'note', label: 'Administrative note', type: 'textarea' },
      ...(override ? [{ name: 'override', label: 'Allow change after work started', type: 'select' as const, options: options(['no', 'yes']), initial: 'no' }] : []),
    ]}
    validate={(values) => !candidates.data?.items.some((item) => item.id === values.technician) ? 'Select a currently eligible technician.'
      : override && values.override !== 'yes' ? 'Explicitly approve the in-progress reassignment.' : undefined}
    submit={(values) => action.mutateAsync({
      path: routes.assignmentAction(booking.id, mode), method: 'POST', body: mode === 'assign'
        ? { technician_id: values.technician, note: optional(values.note) }
        : { new_technician_id: values.technician, reassignment_reason: values.reason.trim(),
          administrative_note: optional(values.note), allow_in_progress: override && values.override === 'yes' },
    })} />;
}

