'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Badge, Details, Heading, Panel, Pager, RecordLink, Refresh, Resource, Table } from '@/components/shared';
import { SelectFilter, TextFilter, useDebounced } from '@/components/filters';
import { FormDialog, type Input, type Values, noteRule, optional, optionalPhone, options, phoneRule } from '@/components/forms';
import { useAction, useApi, useFilters } from '@/hooks/use-api';
import { dateText, label } from '@/lib/utils';
import { usePermissions } from '@/providers/app-providers';
import { routes } from '@/services/routes';
import { employment, type Page, type Technician, type TechnicianCard, type WorkloadCard } from '@/types/api';
import { AssignmentTable } from '@/components/bookings/assignment-workflow';
import { TechnicianSchedule } from './technician-schedule';

const optEmail = z.union([z.literal(''), z.email('Enter a valid email address.')]);
function technicianFields(record: Technician | undefined, changeEmployment: boolean): Input[] {
  const fields: Input[] = [
    { name: 'full_name', label: 'Full name', required: true, initial: record?.full_name, rule: z.string().trim().min(1).max(100) },
    { name: 'primary_phone', label: 'Primary phone', type: 'tel', required: true, initial: record?.primary_phone, rule: phoneRule },
    { name: 'alternate_phone', label: 'Alternate phone', type: 'tel', initial: record?.alternate_phone ?? '', rule: optionalPhone },
    { name: 'email', label: 'Email', type: 'email', initial: record?.email ?? '', rule: optEmail },
    { name: 'address', label: 'Address', initial: record?.address ?? '', rule: z.string().max(800) },
    { name: 'city', label: 'City', initial: record?.city ?? '', rule: z.string().max(120) },
    { name: 'district', label: 'District', initial: record?.district ?? '', rule: z.string().max(120) },
    { name: 'pin_code', label: 'PIN code', initial: record?.pin_code ?? '', rule: z.union([z.literal(''), z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a six-digit Indian PIN code.')]) },
    { name: 'joining_date', label: 'Joining date', type: 'date', initial: record?.joining_date ?? '' },
    { name: 'profile_image_url', label: 'Profile image HTTPS URL', initial: record?.profile_image_url ?? '',
      rule: z.union([z.literal(''), z.url({ protocol: /^https$/ })]) },
    { name: 'notes', label: 'Internal notes', type: 'textarea', initial: record?.notes ?? '', rule: z.string().max(2000) },
  ];
  if (!record || (record.is_active && record.employment_status !== 'terminated')) fields.push({
    name: 'employment_status', label: 'Employment status', type: 'select', initial: record?.employment_status ?? 'active',
    options: options(changeEmployment ? employment : ['active', 'on_leave']),
  });
  return fields;
}

function technicianPayload(values: Values, record?: Technician) {
  return {
    ...Object.fromEntries(Object.entries(values).filter(([name, value]) => name !== 'employment_status'
      && (!record || optional(value) !== record[name as keyof Technician])).map(([name, value]) => [name, optional(value)])),
    ...(values.employment_status && values.employment_status !== record?.employment_status ? { employment_status: values.employment_status } : {}),
  };
}

export function Technicians() {
  const { can } = usePermissions();
  const filter = useFilters({ search: '', sort: 'newest' });
  const search = useDebounced(filter.values.search);
  const params = { ...filter.values, search, page: filter.page };
  const query = useApi<Page<TechnicianCard>>(routes.technicians, params);
  const availability = useApi<Page<WorkloadCard>>(routes.workload, params, can('technicians.availability.read', 'technicians.assignments.read'));
  const [create, setCreate] = useState(false);
  const action = useAction();
  const columns: ColumnDef<TechnicianCard>[] = [
    { accessorKey: 'full_name', header: 'Technician', cell: ({ row }) => <div><RecordLink href={'/technicians/' + row.original.id}>{row.original.full_name}</RecordLink>
      <p className="muted mono" title={row.original.id}>{row.original.id.slice(0, 8)}</p></div> },
    { accessorKey: 'primary_phone', header: 'Phone' },
    { accessorKey: 'city', header: 'City', cell: ({ row }) => row.original.city ?? '—' },
    { accessorKey: 'employment_status', header: 'Employment', cell: ({ row }) => <Badge value={row.original.employment_status} /> },
    { accessorKey: 'is_active', header: 'Account', cell: ({ row }) => <Badge value={row.original.is_active ? 'active' : 'inactive'} /> },
    { id: 'availability', header: 'Availability now', cell: ({ row }) => {
      const value = availability.data?.items.find((item) => item.id === row.original.id)?.availability;
      return value ? <Badge value={value.status} /> : availability.isFetching ? <span className="muted">Loading…</span> : '—';
    } },
    { accessorKey: 'active_assignments', header: 'Active jobs' },
    { accessorKey: 'completed_assignments', header: 'Completed' },
  ];
  return <>
    <Heading title="Technicians" description="Manage field staff, availability and workload." actions={<>
      <Refresh run={() => { void query.refetch(); if (can('technicians.availability.read', 'technicians.assignments.read')) void availability.refetch(); }} busy={query.isFetching} />
      {can('technicians.create') && <Button onClick={() => setCreate(true)}><Plus size={16} />Add technician</Button>}
    </>} />
    <Panel title="Technician directory">
      <div className="toolbar">
        <TextFilter label="Search" className="search-field" value={filter.values.search} onChange={(v) => filter.set('search', v)} placeholder="Name or phone" />
        <SelectFilter label="Employment" value={filter.values.employment_status ?? ''} all="All statuses" choices={options(employment)} onChange={(v) => filter.set('employment_status', v)} />
        <SelectFilter label="Account" value={filter.values.is_active ?? ''} all="All accounts" choices={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]} onChange={(v) => filter.set('is_active', v)} />
        <SelectFilter label="Sort" value={filter.values.sort} choices={options(['newest', 'name', 'joining_date'])} onChange={(v) => filter.set('sort', v)} />
        <Button variant="ghost" onClick={filter.clear}>Clear filters</Button>
      </div>
      <Resource query={query}>{(data) => <><Table rows={data.items} columns={columns} empty="No technicians match these filters" /><Pager data={data} change={filter.setPage} /></>}</Resource>
    </Panel>
    {create && <FormDialog title="Add technician" close={() => setCreate(false)} fields={technicianFields(undefined, can('technicians.deactivate'))}
      submitLabel="Create technician" submit={(values) => action.mutateAsync({ path: routes.technicians, method: 'POST', body: technicianPayload(values) })} />}
  </>;
}

export function TechnicianRecord({ id }: { id: string }) {
  const query = useApi<Technician>(routes.technician(id));
  const { can } = usePermissions();
  const [dialog, setDialog] = useState<'edit' | 'activate' | 'deactivate'>();
  const action = useAction();
  return <Resource query={query}>{(record) => <>
    <Heading title={record.full_name} description="Technician profile and field operations" actions={<>
      <Badge value={record.employment_status} />
      {can('technicians.update') && <Button variant="outline" onClick={() => setDialog('edit')}>Edit technician</Button>}
      {record.is_active && can('technicians.deactivate') && <Button variant="outline" onClick={() => setDialog('deactivate')}>Deactivate</Button>}
      {!record.is_active && record.employment_status !== 'terminated' && can('technicians.activate') &&
        <Button onClick={() => setDialog('activate')}>Activate</Button>}
    </>} />
    <div className="split">
      <Panel title="Profile"><div className="panel-body"><Details items={[
        ['Technician ID', <span className="mono">{record.id}</span>], ['Phone', record.primary_phone], ['Alternate phone', record.alternate_phone],
        ['Email', record.email], ['Address', [record.address, record.city, record.district, record.pin_code].filter(Boolean).join(', ') || '—'],
        ['Joined', dateText(record.joining_date)], ['Notes', record.notes], ['Deactivation reason', record.deactivation_reason],
      ]} /></div></Panel>
      <Panel title="Workload and availability"><div className="panel-body"><Details items={[
        ['Availability now', <Badge value={record.availability.status} />], ['Availability source', label(record.availability.source)],
        ['Active jobs', record.workload.active_assignments], ['Completed', record.workload.completed_assignments],
        ['Rejected', record.workload.rejected_assignments], ['Cancelled', record.workload.cancelled_assignments],
      ]} /></div></Panel>
    </div>
    <TechnicianSchedule id={id} />
    <Panel title="Assignment history"><AssignmentTable path={routes.technicianAssignments(id)} /></Panel>
    {dialog === 'edit' && <FormDialog title="Edit technician" close={() => setDialog(undefined)}
      fields={technicianFields(record, can('technicians.deactivate'))}
      validate={(values) => Object.keys(technicianPayload(values, record)).length === 0 ? 'Change at least one field.' : undefined}
      submit={(values) => action.mutateAsync({ path: routes.technician(id), method: 'PATCH', body: technicianPayload(values, record) })} />}
    {(dialog === 'activate' || dialog === 'deactivate') && <FormDialog title={label(dialog) + ' technician'}
      description={dialog === 'deactivate' ? 'This prevents new assignments. Existing assignments require an explicit decision.' : 'Configure the schedule again after reactivating.'}
      fields={dialog === 'deactivate' ? [
        { name: 'reason', label: 'Reason', type: 'textarea', rule: noteRule, required: record.workload.active_assignments > 0 },
        ...(record.workload.active_assignments > 0 ? [{ name: 'retain', label: 'Retain active assignments', type: 'select' as const, initial: 'no', options: options(['no', 'yes']) }] : []),
      ] : []} close={() => setDialog(undefined)} destructive={dialog === 'deactivate'} submitLabel={label(dialog)}
      validate={(values) => dialog === 'deactivate' && record.workload.active_assignments > 0 && values.retain !== 'yes'
        ? 'Resolve active assignments or explicitly retain them.' : undefined}
      submit={(values) => action.mutateAsync({ path: routes.technicianState(id, dialog), method: 'POST',
        body: dialog === 'deactivate' ? { reason: optional(values.reason), retain_active_assignments: values.retain === 'yes' } : undefined })} />}
  </>}</Resource>;
}

