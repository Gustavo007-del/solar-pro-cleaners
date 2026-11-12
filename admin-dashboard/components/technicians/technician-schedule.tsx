'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge, Panel, Resource, Table, Pager } from '@/components/shared';
import { FormDialog, noteRule, optional, options, type Values } from '@/components/forms';
import { useApi, useAction } from '@/hooks/use-api';
import { dateText } from '@/lib/utils';
import { usePermissions } from '@/providers/app-providers';
import { routes } from '@/services/routes';
import { availabilityStatuses, type Leave, type Page, type Schedule } from '@/types/api';

export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function validateSchedule(values: Values) {
  if (Boolean(values.date) === Boolean(values.weekday)) return 'Choose either a date or a weekday.';
  if (values.start || values.end) {
    if (values.status !== 'available' || !values.start || !values.end || values.start >= values.end) {
      return 'Working hours require Available status and an end time after the start time.';
    }
  }
}

export function TechnicianSchedule({ id }: { id: string }) {
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);
  const [schedule, setSchedule] = useState<Schedule | 'new'>();
  const [leave, setLeave] = useState<{ record?: Leave; remove?: boolean }>();
  const shifts = useApi<Page<Schedule> & { timezone: string }>(routes.schedule(id), { page }, can('technicians.availability.read'));
  const leaves = useApi<Page<Leave>>(routes.leave(id), { page: leavePage }, can('technicians.leave.manage'));
  const action = useAction();
  const availabilityColumns: ColumnDef<Schedule>[] = [
    { id: 'day', header: 'Date or weekday', cell: ({ row }) => row.original.availability_date
      ? dateText(row.original.availability_date) : weekdays[row.original.day_of_week ?? 0] },
    { accessorKey: 'availability_status', header: 'Status', cell: ({ row }) => <Badge value={row.original.availability_status} /> },
    { id: 'hours', header: 'Hours', cell: ({ row }) => row.original.start_time && row.original.end_time
      ? row.original.start_time.slice(0, 5) + '–' + row.original.end_time.slice(0, 5) : '—' },
    { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => row.original.reason ?? '—' },
    ...(can('technicians.availability.manage') ? [{ id: 'edit', header: 'Action', cell: ({ row }: { row: { original: Schedule } }) =>
      <Button variant="ghost" size="sm" onClick={() => setSchedule(row.original)}>Edit</Button> }] : []),
  ];
  const leaveColumns: ColumnDef<Leave>[] = [
    { accessorKey: 'start_date', header: 'From', cell: ({ row }) => dateText(row.original.start_date) },
    { accessorKey: 'end_date', header: 'Through', cell: ({ row }) => dateText(row.original.end_date) },
    { accessorKey: 'is_approved', header: 'Approval', cell: ({ row }) => <Badge value={row.original.is_approved ? 'active' : 'pending'} text={row.original.is_approved ? 'Approved' : 'Pending'} /> },
    { accessorKey: 'reason', header: 'Reason', cell: ({ row }) => row.original.reason ?? '—' },
    { id: 'actions', header: 'Actions', cell: ({ row }) => <div className="actions">
      <Button variant="ghost" size="sm" onClick={() => setLeave({ record: row.original })}>Edit</Button>
      <Button variant="ghost" size="sm" onClick={() => setLeave({ record: row.original, remove: true })}>Remove</Button>
    </div> },
  ];
  const entry = schedule === 'new' ? undefined : schedule;
  return <>
    {can('technicians.availability.read') && <Panel title="Availability schedule" description={shifts.data?.timezone}
      action={can('technicians.availability.manage') && <Button size="sm" onClick={() => setSchedule('new')}>Set availability</Button>}>
      <Resource query={shifts}>{(data) => <><Table rows={data.items} columns={availabilityColumns} empty="No availability configured" /><Pager data={data} change={setPage} /></>}</Resource>
    </Panel>}
    {can('technicians.leave.manage') && <Panel title="Leave" action={<Button size="sm" onClick={() => setLeave({})}>Add leave</Button>}>
      <Resource query={leaves}>{(data) => <><Table rows={data.items} columns={leaveColumns} empty="No leave recorded" /><Pager data={data} change={setLeavePage} /></>}</Resource>
    </Panel>}
    {schedule && <FormDialog title="Set availability" description="A date-specific schedule overrides the recurring weekday."
      close={() => setSchedule(undefined)} validate={validateSchedule} fields={[
        { name: 'date', label: 'Specific date', type: 'date', initial: entry?.availability_date ?? '' },
        { name: 'weekday', label: 'Recurring weekday', type: 'select', initial: entry?.day_of_week?.toString() ?? '',
          options: [{ value: '', label: 'Choose a weekday' }, ...weekdays.map((label, i) => ({ value: String(i), label }))] },
        { name: 'status', label: 'Availability status', type: 'select', initial: entry?.availability_status ?? 'available', options: options(availabilityStatuses) },
        { name: 'start', label: 'Start time', type: 'time', initial: entry?.start_time?.slice(0, 5) ?? '' },
        { name: 'end', label: 'End time', type: 'time', initial: entry?.end_time?.slice(0, 5) ?? '' },
        { name: 'reason', label: 'Reason', type: 'textarea', initial: entry?.reason ?? '', rule: noteRule },
      ]} submit={(values) => action.mutateAsync({ path: routes.schedule(id), method: 'PUT', body: {
        availability_date: optional(values.date), day_of_week: values.weekday === '' ? null : Number(values.weekday),
        availability_status: values.status, start_time: optional(values.start), end_time: optional(values.end), reason: optional(values.reason),
      } })} />}
    {leave && <FormDialog title={leave.remove ? 'Remove leave' : leave.record ? 'Edit leave' : 'Add leave'}
      description={leave.remove ? 'Remove the selected leave record?' : undefined} destructive={leave.remove} close={() => setLeave(undefined)}
      fields={leave.remove ? [] : [
        { name: 'start', label: 'Start date', type: 'date', required: true, initial: leave.record?.start_date },
        { name: 'end', label: 'End date', type: 'date', required: true, initial: leave.record?.end_date },
        { name: 'approved', label: 'Approval', type: 'select', initial: leave.record?.is_approved === false ? 'no' : 'yes', options: options(['yes', 'no']) },
        { name: 'reason', label: 'Reason', type: 'textarea', initial: leave.record?.reason ?? '', rule: noteRule },
      ]} validate={(values) => !leave.remove && values.start > values.end ? 'End date must be on or after the start date.' : undefined}
      submit={(values) => action.mutateAsync({ path: leave.record ? routes.leaveItem(id, leave.record.id) : routes.leave(id),
        method: leave.remove ? 'DELETE' : leave.record ? 'PATCH' : 'POST',
        body: leave.remove ? undefined : { start_date: values.start, end_date: values.end,
          is_approved: values.approved === 'yes', reason: optional(values.reason) },
      })} />}
  </>;
}

