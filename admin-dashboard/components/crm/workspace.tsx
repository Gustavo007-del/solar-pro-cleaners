'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Details, Failure, Field, Heading, Pager, Panel, Resource } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { useAction, useApi, useFilters } from '@/hooks/use-api';
import { useDebounced } from '@/components/filters';
import { label, timestamp } from '@/lib/utils';
import { usePermissions } from '@/providers/app-providers';
import type { Page } from '@/types/api';
import { LeadImport } from './import';

const api = '/admin/crm';
const base = '/crm';
const statuses = ['new', 'contact_pending', 'contacted', 'no_answer', 'interested', 'not_interested',
  'follow_up_required', 'callback_scheduled', 'invalid', 'do_not_contact'];
const priorities = ['low', 'medium', 'high'];
const outcomes = ['answered', 'no_answer', 'busy', 'switched_off', 'invalid_number', 'requested_callback',
  'interested', 'not_interested', 'cleaning_already_completed', 'other'];

const fields = [
  ['name', 'Name', 'text'], ['phone', 'Primary phone', 'tel'], ['alternate_phone', 'Alternate phone', 'tel'],
  ['whatsapp', 'WhatsApp', 'tel'], ['email', 'Email', 'email'], ['location', 'Installation location', 'text'],
  ['district', 'District', 'text'], ['state', 'State', 'text'], ['postal_code', 'PIN code', 'text'],
  ['installation_date', 'Installation date', 'date'], ['latitude', 'Latitude', 'number'],
  ['longitude', 'Longitude', 'number'], ['capacity_kw', 'System capacity (kW)', 'number'],
  ['panel_type', 'Panel type', 'text'], ['panel_count', 'Number of panels', 'number'], ['installer', 'Installation company', 'text'],
] as const;
type Lead = Record<(typeof fields)[number][0], string | number | null> & {
  id: string; source: string; priority: string; interest: string; status: string; assigned_to: string | null;
  archived_at: string | null; last_contacted_at: string | null; next_follow_up: string | null;
  customer_id: string | null; booking_id: string | null; converted_at: string | null;
  contact_blocked: boolean;
};
type FollowUp = { id: string; lead_id: string; name: string | null; phone: string | null; assigned_to: string | null;
  due_at: string; status: string; reason: string; notes: string | null };
type Event = { id: string; lead_id: string; author: string; kind: string; note: string | null;
  details: Record<string, string | null>; created_at: string };
type Person = { id: string; name: string };
type Overview = { total: number; statuses: Record<string, number>; sources: Record<string, number>;
  timeline: { date: string; count: number }[]; due: number; overdue: number; completed: number;
  cancelled: number; contacted: number; calls: number; answered: number };

function Choice({ values, empty, ...props }: { values: string[]; empty?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props}>{empty && <option value="">{empty}</option>}
    {values.map((v) => <option value={v} key={v}>{label(v)}</option>)}</select>;
}

function GridTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="table-scroll"><table className="data-table">
    <thead><tr>{headers.map((head) => <th scope="col" key={head}>{head}</th>)}</tr></thead><tbody>{children}</tbody>
  </table></div>;
}

function Phone({ phone, whatsapp }: { phone: string | number | null; whatsapp?: string | number | null }) {
  const valid = typeof phone === 'string' && /^\+[1-9][0-9]{7,14}$/.test(phone);
  const chat = String(whatsapp ?? phone ?? '');
  return <span className="flex flex-wrap gap-2">
    {valid && <a className="record-link" href={'tel:' + phone}>Call {phone}</a>}
    {/^\+[1-9][0-9]{7,14}$/.test(chat) && <a className="record-link" href={'https://wa.me/' + chat.slice(1)}>WhatsApp</a>}
  </span>;
}

function OverviewPage() {
  const query = useApi<Overview>(api + '/overview');
  const { can } = usePermissions();
  return <><Heading title="Leads overview" actions={<>
    <Button asChild><Link href={base + '/leads/new'}>Add lead</Link></Button>
    {can('crm.manage') && <Button asChild variant="outline"><Link href={base + '/import'}>Import leads</Link></Button>}
  </>} />
    <Resource query={query}>{(data) => {
      const ratio = (a: number, b: number) => b ? `${Math.round(a * 100 / b)}%` : '—';
      const stats: [string, number | string][] = [
        ['Total leads', data.total], ['New', data.statuses.new ?? 0],
        ['Awaiting first contact', (data.statuses.new ?? 0) + (data.statuses.contact_pending ?? 0)],
        ['Successfully contacted', data.contacted], ['Interested', data.statuses.interested ?? 0],
        ['Due today', data.due], ['Overdue', data.overdue], ['Converted', data.statuses.converted ?? 0],
        ['Not interested', data.statuses.not_interested ?? 0], ['Do not contact', data.statuses.do_not_contact ?? 0],
        ['Conversion rate', ratio(data.statuses.converted ?? 0, data.total)], ['Call success rate', ratio(data.answered, data.calls)],
        ['Follow-up completion', ratio(data.completed, data.completed + data.cancelled + data.overdue)],
      ];
      return <>
        <div className="heading-actions"><Link className="record-link" href={base + '/follow-ups?bucket=today'}>Today’s follow-ups</Link>
          <Link className="record-link" href={base + '/follow-ups?bucket=overdue'}>Overdue follow-ups</Link></div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">{stats.map(([name, value]) =>
          <Panel key={name}><div className="panel-body"><p className="muted">{name}</p><strong className="text-2xl">{value}</strong></div></Panel>)}</div>
        <div className="split">
          <Chart title="Leads received in the last 30 days" rows={data.timeline.map(({ date, count }) => ({ name: date.slice(5), count }))} />
          <Chart title="Leads by source" rows={Object.entries(data.sources).map(([name, count]) => ({ name, count }))} />
          <Chart title="Leads by status" rows={Object.entries(data.statuses).map(([name, count]) => ({ name: label(name), count }))} />
        </div>
      </>;
    }}</Resource></>;
}

function Chart({ title, rows }: { title: string; rows: { name: string; count: number }[] }) {
  return <Panel title={title}><div className="panel-body">
    {rows.length ? <><div className="h-52"><ResponsiveContainer><BarChart data={rows}>
      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
      <Bar dataKey="count" name="Leads" fill="#176747" />
    </BarChart></ResponsiveContainer></div>
      <details><summary>Chart data</summary><ul>{rows.map((row) => <li key={row.name}>{row.name}: {row.count}</li>)}</ul></details></>
      : <p className="muted">No leads recorded.</p>}
  </div></Panel>;
}

function LeadForm({ lead, close }: { lead?: Lead; close?: () => void }) {
  const router = useRouter();
  const action = useAction();
  const sources = useApi<string[]>(api + '/sources');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) ?? '').trim() || null]));
    action.mutate({ path: api + '/leads' + (lead ? '/' + lead.id : ''), method: lead ? 'PUT' : 'POST', body: {
      ...data, source: form.get('source'), priority: form.get('priority'), interest: form.get('interest'),
      allow_duplicate: form.get('duplicate') === 'on',
    } }, { onSuccess: (record) => lead ? close?.() : router.push(base + '/leads/' + (record as Lead).id) });
  }
  return <Panel title={lead ? 'Edit lead' : 'Lead information'} description="A name, contact number, email or installation location is enough to start.">
    <form onSubmit={submit} className="panel-body grid gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {fields.map(([key, title, type]) => <Field key={key} label={title}>
          <input name={key} type={type} defaultValue={lead?.[key] ?? ''} step={type === 'number' && key !== 'panel_count' ? 'any' : undefined} />
        </Field>)}
        <Field label="Source"><Choice name="source" values={sources.data ?? ['Manual entry']} defaultValue={lead?.source ?? 'Manual entry'} /></Field>
        <Field label="Priority"><Choice name="priority" values={priorities} defaultValue={lead?.priority ?? 'medium'} /></Field>
        <Field label="Interest"><Choice name="interest" values={['unknown', ...priorities]} defaultValue={lead?.interest ?? 'unknown'} /></Field>
      </div>
      <label><input name="duplicate" type="checkbox" /> Confirm a separate record if this phone number already exists</label>
      {action.error && <Failure error={action.error} />}
      <div className="heading-actions"><Button type="submit" disabled={action.isPending}>Save lead</Button>
        {close && <Button variant="outline" onClick={close}>Cancel</Button>}</div>
    </form>
  </Panel>;
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return '"' + (/^\s*[=+\-@\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
}

function LeadsPage() {
  const filter = useFilters({ search: '', status: '', source: '', district: '', sort: 'newest', archived: 'false' });
  const search = useDebounced(filter.values.search);
  const params = { ...filter.values, search, page: filter.page };
  const leads = useApi<Page<Lead>>(api + '/leads', params);
  const sources = useApi<string[]>(api + '/sources');
  const { can } = usePermissions();
  const managed = can('crm.manage');
  const staff = useApi<Person[]>(api + '/staff', {}, managed);
  const action = useAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const filterBy = (name: string, value: string) => { filter.set(name, value); setSelected([]); };
  async function download() {
    setExportError(''); setExporting(true);
    try {
      const { adminRequest } = await import('@/services/auth');
      const { queryPath } = await import('@/services/api-client');
      const columns = ['id', 'status', 'source', ...fields.map(([key]) => key)] as const;
      const rows: string[] = [columns.join(',')];
      for (let page = 1; page <= 50; page++) {
        const result = await adminRequest<Page<Lead>>(queryPath(api + '/leads', { ...params, page, page_size: 100 }));
        rows.push(...result.items.map((lead) => columns.map((key) => csvCell(lead[key])).join(',')));
        if (!result.has_next) break;
        if (page === 50) throw new Error('Refine filters to export at most 5,000 leads.');
      }
      const url = URL.createObjectURL(new Blob(['\ufeff', rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'solar-care-leads.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed.'); }
    finally { setExporting(false); }
  }
  function bulk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get('action'));
    const value = String(form.get('value'));
    const keys: Record<string, string> = { assign: 'assigned_to', status: 'status', priority: 'priority' };
    action.mutate({ path: api + '/leads/bulk', method: 'POST', body: {
      ids: selected, action: kind, ...(keys[kind] ? { [keys[kind]]: value || null } : {}),
    } }, { onSuccess: () => setSelected([]) });
  }
  const [bulkKind, setBulkKind] = useState('assign');
  return <><Heading title="All leads" actions={<>
    <Button asChild><Link href={base + '/leads/new'}>Add lead</Link></Button>
    {managed && <><Button asChild variant="outline"><Link href={base + '/import'}>Import</Link></Button>
      <Button variant="outline" disabled={exporting} onClick={() => void download()}>Export filtered CSV</Button></>}
  </>} />
    {exportError && <p role="alert">{exportError}</p>}
    <Panel title="Lead directory"><div className="toolbar">
      <Field label="Search"><input value={filter.values.search} onChange={(e) => filterBy('search', e.target.value)} placeholder="Name, phone or location" /></Field>
      <Field label="Status"><Choice empty="All statuses" values={[...statuses, 'converted']} value={filter.values.status} onChange={(e) => filterBy('status', e.target.value)} /></Field>
      <Field label="Source"><Choice empty="All sources" values={sources.data ?? []} value={filter.values.source} onChange={(e) => filterBy('source', e.target.value)} /></Field>
      <Field label="District"><input value={filter.values.district} onChange={(e) => filterBy('district', e.target.value)} /></Field>
      {managed && <Field label="Assigned to"><select onChange={(e) => filterBy('assigned_to', e.target.value)}><option value="">All staff</option>
        {staff.data?.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></Field>}
      <Field label="Installed from"><input type="date" onChange={(e) => filterBy('installed_from', e.target.value)} /></Field>
      <Field label="Installed through"><input type="date" onChange={(e) => filterBy('installed_to', e.target.value)} /></Field>
      <Field label="Follow-up date"><input type="date" onChange={(e) => filterBy('follow_up_date', e.target.value)} /></Field>
      <Field label="Sort"><Choice values={['newest', 'oldest', 'priority', 'follow_up']} value={filter.values.sort} onChange={(e) => filterBy('sort', e.target.value)} /></Field>
      <label><input type="checkbox" checked={filter.values.archived === 'true'} onChange={(e) => filterBy('archived', String(e.target.checked))} /> Show archived</label>
    </div>
      {managed && selected.length > 0 && <form className="toolbar" onSubmit={bulk}>
        <Field label={selected.length + ' selected'}><Choice name="action" value={bulkKind} onChange={(e) => setBulkKind(e.target.value)}
          values={['assign', 'priority', 'status', 'archive', 'restore']} /></Field>
        {bulkKind === 'assign' && <Field label="Assign to"><select name="value"><option value="">Unassigned</option>
          {staff.data?.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></Field>}
        {bulkKind === 'priority' && <Field label="Priority"><Choice name="value" values={priorities} /></Field>}
        {bulkKind === 'status' && <Field label="Status"><Choice name="value" values={statuses} /></Field>}
        <Button type="submit" disabled={action.isPending}>Apply to selected</Button>
      </form>}
      {action.error && <Failure error={action.error} />}
      <Resource query={leads}>{(data) => <>
        {data.items.length ? <GridTable headers={[...(managed ? ['Select'] : []), 'Lead', 'Phone', 'Location', 'Installed', 'Source', 'Status',
          'Priority', 'Assigned to', 'Last call', 'Next follow-up', 'Actions']}>
          {data.items.map((lead) => <tr key={lead.id}>
            {managed && <td><input type="checkbox" aria-label={'Select ' + (lead.name || lead.id)} checked={selected.includes(lead.id)}
              onChange={(e) => setSelected(e.target.checked ? [...selected, lead.id] : selected.filter((id) => id !== lead.id))} /></td>}
            <td><Link className="record-link" href={base + '/leads/' + lead.id}>{lead.name || 'Unknown'}</Link><small className="block muted">{lead.id.slice(0, 8)}</small></td>
            <td>{lead.phone || '—'}</td><td>{lead.location || lead.district || '—'}</td><td>{lead.installation_date || '—'}</td>
            <td>{lead.source}</td><td><Badge value={lead.status} /></td><td>{label(lead.priority)}</td>
            <td>{staff.data?.find((person) => person.id === lead.assigned_to)?.name ?? (lead.assigned_to ? 'Assigned' : 'Unassigned')}</td>
            <td>{timestamp(lead.last_contacted_at)}</td><td>{timestamp(lead.next_follow_up)}</td>
            <td>{lead.contact_blocked ? 'Do Not Contact' : !lead.archived_at && <Phone phone={lead.phone} whatsapp={lead.whatsapp} />}</td>
          </tr>)}
        </GridTable> : <p className="panel-body muted">No leads match these filters.</p>}
        <Pager data={data} change={(page) => { filter.setPage(page); setSelected([]); }} />
      </>}</Resource>
    </Panel>
  </>;
}

function FollowFields({ optional = false }: { optional?: boolean }) {
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label={optional ? 'Callback date and time (optional)' : 'Follow-up date and time (your local time)'}>
      <input type="datetime-local" name="due_at" required={!optional} />
    </Field>
    <Field label="Follow-up reason"><input name="reason" maxLength={300} required={!optional} /></Field>
    {!optional && <Field label="Follow-up notes"><textarea name="notes" maxLength={3000} /></Field>}
  </div>;
}

function followPayload(form: FormData) {
  const value = String(form.get('due_at') ?? '');
  return value ? { due_at: new Date(value).toISOString(), reason: String(form.get('reason') || 'Customer callback'),
    notes: form.get('notes') || null } : null;
}

function FollowUps({ leadId }: { leadId?: string }) {
  const initialBucket = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('bucket') === 'overdue' ? 'overdue' : 'today';
  const filter = useFilters({ bucket: leadId ? 'history' : initialBucket });
  const query = useApi<Page<FollowUp>>(api + '/follow-ups', { ...filter.values, page: filter.page, lead_id: leadId });
  const action = useAction();
  const [reschedule, setReschedule] = useState<string>();
  return <Panel title="Follow-ups">
    {!leadId && <div className="toolbar"><Field label="Show"><Choice values={['today', 'overdue', 'upcoming', 'completed', 'history']}
      value={filter.values.bucket} onChange={(e) => filter.set('bucket', e.target.value)} /></Field></div>}
    {action.error && <Failure error={action.error} />}
    <Resource query={query}>{(data) => <>
      {data.items.length ? <GridTable headers={['Lead', 'Due', 'Status', 'Reason', 'Actions']}>
        {data.items.map((row) => <tr key={row.id}>
          <td><Link className="record-link" href={base + '/leads/' + row.lead_id}>{row.name || row.lead_id.slice(0, 8)}</Link>
            <small className="block">{row.phone}</small></td>
          <td>{timestamp(row.due_at)}</td><td><Badge value={row.status === 'open' && Date.parse(row.due_at) < Date.now() ? 'overdue' : row.status} /></td>
          <td>{row.reason}{row.notes && <small className="block muted">{row.notes}</small>}</td>
          <td>{row.status === 'open' && <div className="grid gap-2">
            <Phone phone={row.phone} />
            <div className="flex flex-wrap gap-2">{(['complete', 'cancel'] as const).map((op) =>
              <Button size="sm" variant="outline" key={op} disabled={action.isPending}
                onClick={() => action.mutate({ path: api + '/follow-ups/' + row.id + '/' + op, method: 'POST' })}>{label(op)}</Button>)}
              <Button size="sm" variant="outline" onClick={() => setReschedule(row.id)}>Reschedule</Button></div>
            {reschedule === row.id && <form onSubmit={(event) => {
              event.preventDefault(); const body = followPayload(new FormData(event.currentTarget));
              if (body) action.mutate({ path: api + '/follow-ups/' + row.id + '/reschedule', method: 'POST', body },
                { onSuccess: () => setReschedule(undefined) });
            }} className="grid gap-2"><FollowFields /><Button type="submit" disabled={action.isPending}>Save new time</Button></form>}
          </div>}</td>
        </tr>)}
      </GridTable> : <p className="panel-body muted">No follow-ups to show.</p>}
      <Pager data={data} change={filter.setPage} />
    </>}</Resource>
  </Panel>;
}

function Timeline({ leadId, calls = false }: { leadId?: string; calls?: boolean }) {
  const [page, setPage] = useState(1);
  const query = useApi<Page<Event>>(api + '/events', { lead_id: leadId, calls, page });
  return <Panel title={calls ? 'Call history' : 'Activity and notes'}>
    <Resource query={query}>{(data) => <>
      {data.items.length ? <div className="panel-body grid gap-3">{data.items.map((event) => <article className="border-b pb-3" key={event.id}>
        <strong>{label(event.details.outcome || event.details.status || event.kind)}</strong>
        <p className="muted">{event.author} · {timestamp(event.created_at)}
          {!leadId && <> · <Link className="record-link" href={base + '/leads/' + event.lead_id}>Open lead</Link></>}</p>
        {event.note && <p className="whitespace-pre-wrap break-words">{event.note}</p>}
        {event.details.response && <p>Response: {event.details.response}</p>}
        {event.details.next_action && <p>Next action: {event.details.next_action}</p>}
      </article>)}</div> : <p className="panel-body muted">No activity recorded.</p>}
      <Pager data={data} change={setPage} />
    </>}</Resource>
  </Panel>;
}

function LeadRecord({ id }: { id: string }) {
  const query = useApi<Lead>(api + '/leads/' + id);
  return <Resource query={query}>{(lead) => <LeadDetails lead={lead} />}</Resource>;
}

function LeadDetails({ lead }: { lead: Lead }) {
  const [editing, setEditing] = useState(false);
  const { can } = usePermissions();
  const managed = can('crm.manage');
  const action = useAction();
  const staff = useApi<Person[]>(api + '/staff', {}, managed);
  const path = api + '/leads/' + lead.id;
  const available = !lead.archived_at && !lead.contact_blocked;
  const matches = useApi<Person[]>(path + '/customer-matches', {}, managed && available);
  const services = useApi<Page<{ id: string; name: string }>>('/services', {}, managed && available && !lead.booking_id);
  const [copied, setCopied] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>, suffix: string, convert: (data: FormData) => object, reset = false) {
    event.preventDefault();
    const form = event.currentTarget;
    action.mutate({ path: path + suffix, method: 'POST', body: convert(new FormData(form)) },
      { onSuccess: () => { if (reset) form.reset(); } });
  }
  return <><Heading title={String(lead.name || 'Unknown lead')} description={'Lead ' + lead.id} actions={<>
    <Badge value={lead.archived_at ? 'archived' : lead.status} />
    {!lead.archived_at && <Button variant="outline" onClick={() => setEditing(!editing)}>Edit lead</Button>}
    {managed && <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({
      path: api + '/leads/bulk', method: 'POST', body: { ids: [lead.id], action: lead.archived_at ? 'restore' : 'archive' },
    })}>{lead.archived_at ? 'Restore' : 'Archive'}</Button>}
  </>} />
    {action.error && <Failure error={action.error} />}
    {editing && <LeadForm lead={lead} close={() => setEditing(false)} />}
    {lead.contact_blocked && <p role="status">Do Not Contact. Calls and follow-up scheduling are blocked.</p>}
    <div className="split">
      <Panel title="Customer details"><div className="panel-body grid gap-3">
        <Details items={fields.slice(0, 5).map(([key, title]) => [title, lead[key] ?? 'Not provided'])} />
        {available && <Phone phone={lead.phone || lead.alternate_phone} whatsapp={lead.whatsapp} />}
        {available && lead.phone && <Button variant="outline" onClick={() => void navigator.clipboard.writeText(String(lead.phone))
          .then(() => setCopied(true)).catch(() => setCopied(false))}>{copied ? 'Copied' : 'Copy phone number'}</Button>}
      </div></Panel>
      <Panel title="Solar installation"><div className="panel-body">
        <Details items={fields.slice(5).map(([key, title]) => [title, lead[key] ?? 'Not provided'])} />
      </div></Panel>
    </div>
    {!lead.archived_at && <Panel title="Lead status"><div className="panel-body grid gap-3">
      <Details items={[[ 'Priority', label(lead.priority)], ['Interest', label(lead.interest)],
        ['Last contacted', timestamp(lead.last_contacted_at)], ['Next follow-up', timestamp(lead.next_follow_up)]]} />
      {(lead.status !== 'do_not_contact' || managed) && <form className="heading-actions" onSubmit={(e) => submit(e, '/status', (form) =>
        ({ status: form.get('status'), reason: form.get('reason') || null }))}>
        <Field label="New status"><Choice name="status" defaultValue={lead.status}
          values={lead.status === 'converted' ? ['converted', 'do_not_contact'] : statuses} /></Field>
        <Field label="Reason"><input name="reason" maxLength={3000} required={lead.status === 'do_not_contact'} /></Field>
        <Button type="submit" disabled={action.isPending}>Update status</Button>
      </form>}
      {managed && <form key={lead.assigned_to} className="heading-actions" onSubmit={(e) => {
        e.preventDefault();
        action.mutate({ path: api + '/leads/bulk', method: 'POST', body: { ids: [lead.id], action: 'assign',
          assigned_to: new FormData(e.currentTarget).get('staff') || null } });
      }}><Field label="Assigned staff"><select name="staff" defaultValue={lead.assigned_to ?? ''}>
        <option value="">Unassigned</option>{staff.data?.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}
      </select></Field><Button type="submit" disabled={action.isPending}>Save assignment</Button></form>}
    </div></Panel>}
    {available && <div className="split">
      <Panel title="Record a call"><form className="panel-body grid gap-3" onSubmit={(e) => submit(e, '/interactions', (form) => ({
        outcome: form.get('outcome'), note: form.get('note') || null, response: form.get('response') || null,
        next_action: form.get('next_action') || null, interest: form.get('interest') || null, follow_up: followPayload(form),
      }), true)}>
        <Field label="Outcome"><Choice name="outcome" values={outcomes} /></Field>
        <Field label="Interest"><Choice name="interest" empty="Keep current" values={['unknown', ...priorities]} /></Field>
        <Field label="Call notes"><textarea name="note" maxLength={3000} /></Field>
        <Field label="Customer response"><input name="response" maxLength={300} /></Field>
        <Field label="Next action"><input name="next_action" maxLength={300} /></Field>
        {!lead.next_follow_up && <FollowFields optional />}
        <Button type="submit" disabled={action.isPending}>Save interaction</Button>
      </form></Panel>
      {!lead.next_follow_up && <Panel title="Schedule follow-up"><form className="panel-body grid gap-3"
        onSubmit={(e) => submit(e, '/follow-ups', (form) => followPayload(form) ?? {}, true)}>
        <FollowFields /><Button type="submit" disabled={action.isPending}>Schedule</Button>
      </form></Panel>}
    </div>}
    <Panel title="Internal note"><form className="panel-body grid gap-3" onSubmit={(e) => submit(e, '/notes', (form) =>
      ({ note: form.get('note') }), true)}>
      <Field label="Note"><textarea name="note" required maxLength={3000} /></Field>
      <Button type="submit" disabled={action.isPending}>Add note</Button>
    </form></Panel>
    {managed && available && <Panel title="Convert lead"><div className="panel-body grid gap-3">
      {lead.customer_id && <p>Linked to <Link className="record-link" href={'/customers/' + lead.customer_id}>customer</Link>
        {lead.booking_id && <> and <Link className="record-link" href={'/bookings/' + lead.booking_id}>booking</Link></>}.</p>}
      {!lead.booking_id && <Resource query={matches}>{(people) => people.length ? <form className="grid gap-3" onSubmit={(e) => submit(e, '/convert', (form) =>
        ({ customer_id: form.get('customer_id'), booking_id: form.get('booking_id') || null,
          booking: form.get('service_id') ? { service_id: form.get('service_id'), service_date: form.get('date') || null,
            address: form.get('booking_address') ? { address_line: form.get('booking_address'),
              postal_code: form.get('booking_pin') || null, district: lead.district, location_source: 'manual' } : null,
            pricing: { panel_quantity: form.get('quantity') ? Number(form.get('quantity')) : null } } : null }))}>
        <Field label="Matching customer"><select name="customer_id" defaultValue={lead.customer_id ?? people[0].id}>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></Field>
        <Field label="Existing booking ID (optional)"><input name="booking_id" defaultValue={lead.booking_id ?? ''} maxLength={36} /></Field>
        <Field label="Or create a booking for"><select name="service_id"><option value="">No new booking</option>
          {services.data?.items.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field>
        <Field label="Preferred service date"><input type="date" name="date" /></Field>
        <Field label="Service address (optional)"><input name="booking_address" defaultValue={lead.location ?? ''} maxLength={800} /></Field>
        <Field label="Service PIN code"><input name="booking_pin" inputMode="numeric" defaultValue={lead.postal_code ?? ''} pattern="[1-9][0-9]{5}" /></Field>
        <Field label="Number of panels (required for per-panel pricing)"><input type="number" name="quantity" min={1} /></Field>
        {services.error && <Failure error={services.error} />}
        <Button type="submit" disabled={action.isPending}>Save conversion</Button>
      </form> : <p>No matching active customer. Check the phone number or ask the customer to register in Solar Care, then try again.</p>}</Resource>}
    </div></Panel>}
    <Timeline leadId={lead.id} /><FollowUps leadId={lead.id} />
  </>;
}

function SourcesPage() {
  const query = useApi<string[]>(api + '/sources');
  const action = useAction();
  return <><Heading title="Lead sources" /><Panel title="Sources">
    <form className="toolbar" onSubmit={(e) => {
      e.preventDefault(); const form = e.currentTarget;
      action.mutate({ path: api + '/sources', method: 'POST', body: { name: new FormData(form).get('name') } },
        { onSuccess: () => form.reset() });
    }}><Field label="New source"><input name="name" maxLength={100} required /></Field>
      <Button type="submit" disabled={action.isPending}>Add source</Button></form>
    {action.error && <Failure error={action.error} />}
    <Resource query={query}>{(sources) => <ul className="panel-body">{sources.map((source) => <li key={source}>{source}</li>)}</ul>}</Resource>
  </Panel></>;
}

export function CrmWorkspace({ view, id }: { view: 'overview' | 'leads' | 'new' | 'detail' | 'follow-ups' | 'calls' | 'sources' | 'import'; id?: string }) {
  const { can } = usePermissions();
  if (!can('crm.work') || (view === 'sources' || view === 'import') && !can('crm.manage')) {
    return <Heading title="CRM access restricted" />;
  }
  switch (view) {
    case 'overview': return <OverviewPage />;
    case 'leads': return <LeadsPage />;
    case 'new': return <><Heading title="Add lead" /><LeadForm /></>;
    case 'detail': return id ? <LeadRecord id={id} /> : null;
    case 'follow-ups': return <><Heading title="Follow-ups" /><FollowUps /></>;
    case 'calls': return <><Heading title="Call history" /><Timeline calls /></>;
    case 'sources': return <SourcesPage />;
    case 'import': return <LeadImport />;
  }
}
