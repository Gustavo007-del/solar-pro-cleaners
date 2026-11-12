'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { SelectFilter, TextFilter, useDebounced } from '@/components/filters';
import { options } from '@/components/forms';
import { Badge, Details, Failure, Field, Heading, Pager, Panel, RecordLink, Refresh, Resource, Table } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { useAction, useApi, useFilters } from '@/hooks/use-api';
import { dateText, label, timestamp } from '@/lib/utils';
import { Bell } from 'lucide-react';
import { usePermissions } from '@/providers/app-providers';
import { routes } from '@/services/routes';
import type { CustomerCard, Page } from '@/types/api';

const base = '/admin/notifications';
const campaignsPath = base + '/campaigns';
const screen = '/notifications';
const states = ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'failed'];
const categories = ['announcement', 'promotional', 'service_update', 'booking_related', 'general'];
const frequencies = ['minutes', 'hours', 'daily', 'weekly', 'monthly'];
const deliveryStates = ['queued', 'sending', 'submitted', 'provider_accepted', 'failed', 'invalid_device', 'skipped', 'cancelled'];
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type Schedule = {
  mode: string; timezone: string; start_at: string | null; end_at: string | null;
  frequency: string | null; interval: number; weekdays: number[]; month_day: number | null; max_occurrences: number | null;
};
type Campaign = {
  id: string; title: string; message: string; notification_type: string; recipient_type: string; customer_ids: string[];
  destination: string | null; booking_id: string | null; custom_data: Record<string, unknown>; schedule: Schedule;
  status: string; created_at: string; next_run_at: string | null; occurrence_count: number; created_by_admin_id: string;
};
type Execution = {
  id: string; scheduled_execution_at: string; started_at: string; completed_at: string | null;
  execution_status: string; recipients_count: number; successful_submissions: number; failed_submissions: number;
};
type Delivery = {
  id: string; customer_id: string; platform: string; status: string; attempts: number;
  sent_at: string | null; receipt_checked_at: string | null; error_code: string | null; submission_accepted: boolean;
};
type Action = 'send' | 'schedule' | 'pause' | 'resume' | 'cancel' | 'delete';

const campaignColumns: ColumnDef<Campaign>[] = [
  { header: 'Campaign', accessorKey: 'title', cell: ({ row }) => <RecordLink href={screen + '/' + row.original.id}>{row.original.title}</RecordLink> },
  { header: 'Category', accessorKey: 'notification_type', cell: ({ row }) => label(row.original.notification_type) },
  { header: 'Audience', accessorKey: 'recipient_type', cell: ({ row }) => audience(row.original) },
  { header: 'Status', accessorKey: 'status', cell: ({ row }) => <Badge value={row.original.status} /> },
  { header: 'Schedule', id: 'schedule', cell: ({ row }) => label(row.original.schedule.mode) },
  { header: 'Created', accessorKey: 'created_at', cell: ({ row }) => dateText(row.original.created_at) },
  { header: 'Next run', accessorKey: 'next_run_at', cell: ({ row }) => timestamp(row.original.next_run_at, row.original.schedule.timezone) },
  { header: 'Runs', accessorKey: 'occurrence_count' },
  { header: 'Creator ID', accessorKey: 'created_by_admin_id' },
];
function audience(campaign: Campaign) {
  return campaign.recipient_type === 'all_customers' ? 'All opted-in devices' : `${campaign.customer_ids.length} selected customer(s)`;
}
function filterDate(date: string | undefined, end = false) {
  if (!date) return undefined;
  const value = new Date(date + 'T00:00:00');
  if (!Number.isFinite(value.getTime())) return undefined;
  if (end) value.setDate(value.getDate() + 1);
  return value.toISOString();
}

export function NotificationCampaigns() {
  const { can } = usePermissions();
  const filters = useFilters({ search: '', status: '', sort: 'newest', from: '', to: '' });
  const { search, status, sort, from, to } = filters.values;
  const query = useApi<Page<Campaign>>(campaignsPath, {
    search: useDebounced(search), status, sort, created_from: filterDate(from), created_to: filterDate(to, true), page: filters.page,
  });
  const stats = useApi<Record<string, number>>(base + '/stats');
  return <>
    <Heading title="Notifications" description="Send a custom message or plan a recurring campaign."
      actions={<><Refresh run={() => { void query.refetch(); void stats.refetch(); }} busy={query.isFetching || stats.isFetching} />
        {can('notifications.manage') && <Button asChild><Link href={screen + '/new'}>New campaign</Link></Button>}</>} />
    <Panel title="Push activity"><div className="panel-body"><Resource query={stats}>{(data) => <Details items={[
      ['Campaigns', data.campaigns], ['Scheduled', data.scheduled], ['In progress', data.active],
      ['Paused', data.paused], ['Completed', data.completed],
      ['Expo tickets accepted', data.submissions], ['Failed submissions', data.failed_submissions],
      ['Eligible devices', data.eligible_devices], ['Accepted by push provider', data.provider_accepted],
      ['Failed deliveries', data.failed_deliveries],
    ]} />}</Resource></div></Panel>
    <Panel title="Campaigns">
      <div className="toolbar">
        <TextFilter label="Search" placeholder="Title or message" value={search} onChange={(v) => filters.set('search', v)} />
        <SelectFilter label="Status" all="All statuses" choices={options(states)} value={status} onChange={(v) => filters.set('status', v)} />
        <SelectFilter label="Sort" choices={options(['newest', 'oldest', 'next_run'])} value={sort} onChange={(v) => filters.set('sort', v)} />
        <TextFilter label="Created from" type="date" value={from} onChange={(v) => filters.set('from', v)} />
        <TextFilter label="Created through" type="date" value={to} onChange={(v) => filters.set('to', v)} />
        <Button variant="ghost" onClick={filters.clear}>Clear filters</Button>
      </div>
      <Resource query={query}>{(data) => <><Table columns={campaignColumns} rows={data.items} empty="No campaigns match these filters" />
        <Pager data={data} change={filters.setPage} /></>}</Resource>
    </Panel>
  </>;
}

function localInput(value: string | null | undefined, zone: string) {
  if (!value) return '';
  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return value.slice(0, 16);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find(({ type }) => type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function Select({ value, change, values }: { value: string; change: (value: string) => void; values: string[] }) {
  return <select value={value} onChange={(event) => change(event.target.value)}>
    {values.map((key) => <option key={key} value={key}>{key ? label(key) : 'None'}</option>)}
  </select>;
}

function Composer({ campaign, close }: { campaign?: Campaign; close?: () => void }) {
  const router = useRouter();
  const { can } = usePermissions();
  const action = useAction();
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [message, setMessage] = useState(campaign?.message ?? '');
  const [type, setType] = useState(campaign?.notification_type ?? 'general');
  const [all, setAll] = useState(campaign?.recipient_type === 'all_customers');
  const [selected, setSelected] = useState<Record<string, string>>(Object.fromEntries((campaign?.customer_ids ?? []).map((id) => [id, id])));
  const [search, setSearch] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [mode, setMode] = useState(campaign?.schedule.mode ?? 'now');
  const [zone, setZone] = useState(campaign?.schedule.timezone ?? 'Asia/Kolkata');
  const [start, setStart] = useState(localInput(campaign?.schedule.start_at, zone));
  const [end, setEnd] = useState(localInput(campaign?.schedule.end_at, zone));
  const [frequency, setFrequency] = useState(campaign?.schedule.frequency ?? 'daily');
  const [interval, setInterval] = useState(String(campaign?.schedule.interval ?? 1));
  const [weekdays, setWeekdays] = useState(campaign?.schedule.weekdays ?? []);
  const [monthDay, setMonthDay] = useState(campaign?.schedule.month_day?.toString() ?? '');
  const [max, setMax] = useState(campaign?.schedule.max_occurrences?.toString() ?? '');
  const [destination, setDestination] = useState(campaign?.destination ?? '');
  const [bookingId, setBookingId] = useState(campaign?.booking_id ?? '');
  const [custom, setCustom] = useState(campaign ? JSON.stringify(campaign.custom_data, null, 2) : '');
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string>();
  const customers = useApi<Page<CustomerCard>>(routes.customers, {
    search: useDebounced(search), page: customerPage, page_size: 8, is_active: true,
  }, !all);
  const cadence = ({ daily: 'days', weekly: 'weeks', monthly: 'months' } as Record<string, string>)[frequency] ?? frequency;
  const plan = mode === 'now' ? 'Send when the campaign is confirmed.'
    : `${mode === 'repeat' ? `Repeat every ${interval} ${cadence}${frequency === 'weekly' && weekdays.length ? ` on ${weekdays.map((day) => dayNames[day]).join(', ')}` : ''}${frequency === 'monthly' && monthDay ? ` on day ${monthDay}` : ''}, starting` : 'Send once'} ${start ? start.replace('T', ' ') : 'at the selected time'} (${zone || 'timezone required'})${mode === 'repeat' && end ? ` through ${end.replace('T', ' ')}` : ''}${mode === 'repeat' && max ? `, up to ${max} runs` : ''}.`;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    let customData: unknown;
    try {
      customData = custom.trim() ? JSON.parse(custom) : {};
      if (!customData || typeof customData !== 'object' || Array.isArray(customData)) throw new Error();
    } catch { setError('Enter a JSON object for custom data, or leave it empty.'); return; }
    if (!all && !Object.keys(selected).length) { setError('Select at least one customer.'); return; }
    if (!title.trim() || !message.trim()) { setError('Enter a title and message.'); return; }
    const payload = {
      title, message, notification_type: type, recipient_type: all ? 'all_customers' : 'selected_customers',
      customer_ids: all ? [] : Object.keys(selected), destination: destination || null,
      booking_id: destination === 'booking' ? bookingId.trim() : null, custom_data: customData,
      schedule: {
        mode, timezone: zone.trim(), start_at: mode === 'now' ? null : start,
        ...(mode === 'repeat' ? { frequency, interval: Number(interval), end_at: end || null,
          max_occurrences: max ? Number(max) : null, weekdays: frequency === 'weekly' ? weekdays : [],
          month_day: frequency === 'monthly' && monthDay ? Number(monthDay) : null } : {}),
      },
    };
    try {
      if (campaign) {
        await action.mutateAsync({ path: campaignsPath + '/' + campaign.id, method: 'PUT', body: payload });
        close?.();
      } else {
        const id = requestId ?? crypto.randomUUID();
        setRequestId(id);
        const saved = await action.mutateAsync({ path: campaignsPath, method: 'POST', body: { ...payload, request_id: id } }) as Campaign;
        router.push(screen + '/' + saved.id);
      }
    } catch { /* useAction displays the API error. */ }
  }

  return <form onSubmit={(event) => { void save(event); }} className="grid gap-4">
    <div className="split">
      <Panel title="Message"><div className="panel-body grid gap-3">
        <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} /></Field>
        <Field label="Message"><textarea value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={700} rows={4} /></Field>
        <Field label="Category"><Select value={type} change={setType} values={categories} /></Field>
        <Field label="Open on tap"><Select value={destination} change={setDestination} values={all ? ['', 'home', 'bookings', 'contact'] : ['', 'home', 'bookings', 'contact', 'booking']} /></Field>
        {destination === 'booking' && <Field label="Booking ID (select only the booking’s customer)">
          <input value={bookingId} onChange={(e) => setBookingId(e.target.value)} required maxLength={36} /></Field>}
        <details><summary>Custom data (optional)</summary><Field label="JSON object, maximum 1 KB">
          <textarea rows={3} value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={1024} /></Field></details>
      </div></Panel>
      <Panel title="Phone preview" description="Avoid private information. Push messages can appear on a locked screen.">
        <div className="panel-body"><div className="address-entry break-words whitespace-pre-wrap">
          <small className="flex items-center gap-2"><Bell size={14} aria-hidden />Solar Care</small>
          <strong>{title || 'Notification title'}</strong><p>{message || 'Your message appears here.'}</p>
        </div></div>
        <div className="panel-body"><Details items={[
          ['Audience', all ? 'All opted-in devices' : `${Object.keys(selected).length} selected customers`], ['Planned send', plan],
        ]} /></div>
      </Panel>
    </div>
    <Panel title="Audience" description="Customers must have notifications enabled on an eligible device.">
      <div className="panel-body grid gap-3">
        <Field label="Recipients"><select value={all ? 'all' : 'selected'} onChange={(e) => {
          const broadcast = e.target.value === 'all';
          setAll(broadcast);
          if (broadcast && destination === 'booking') setDestination('');
        }}><option value="selected">Selected customers</option>
          {(can('notifications.broadcast') || all) && <option value="all">All opted-in customers</option>}</select></Field>
        {!all && <>
          <TextFilter label="Find customers" placeholder="Name or phone prefix" value={search}
            onChange={(v) => { setSearch(v); setCustomerPage(1); }} />
          <div className="flex flex-wrap gap-2">{Object.entries(selected).map(([id, name]) =>
            <Button type="button" size="sm" variant="outline" key={id} onClick={() => setSelected((previous) => {
              const next = { ...previous }; delete next[id]; return next;
            })}>Remove {name}</Button>)}</div>
          <Resource query={customers}>{(data) => <>
            {data.items.map((customer) => <label key={customer.id} className="flex items-center gap-2">
              <input type="checkbox" checked={customer.id in selected} onChange={(event) => {
                const checked = event.target.checked;
                setSelected((previous) => {
                  const next = { ...previous };
                  if (checked) next[customer.id] = customer.full_name; else delete next[customer.id];
                  return next;
                });
              }} />{customer.full_name} · {customer.phone_number}
            </label>)}
            <Pager data={data} change={setCustomerPage} />
          </>}</Resource>
        </>}
      </div>
    </Panel>
    <Panel title="Schedule"><div className="panel-body grid gap-3">
      <Field label="When to send"><select value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="now">Send now after review</option><option value="once">Schedule once</option><option value="repeat">Repeat</option>
      </select></Field>
      {mode !== 'now' && <div className="split">
        <Field label="Start date and time"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Timezone (IANA)"><input value={zone} onChange={(e) => setZone(e.target.value)} maxLength={64} required /></Field>
      </div>}
      {mode === 'repeat' && <>
        <div className="split">
          <Field label="Repeat frequency"><Select value={frequency} change={setFrequency} values={frequencies} /></Field>
          <Field label={`Every N ${({ daily: 'days', weekly: 'weeks', monthly: 'months' } as Record<string, string>)[frequency] ?? frequency}`}>
            <input type="number" min={1} max={365} value={interval} onChange={(e) => setInterval(e.target.value)} required />
          </Field>
        </div>
        {frequency === 'weekly' && <fieldset><legend>Weekdays (defaults to the start day)</legend>
          <div className="flex flex-wrap gap-3">{dayNames.map((day, i) => <label key={day} className="inline-flex gap-1">
            <input type="checkbox" checked={weekdays.includes(i)} onChange={(e) =>
              setWeekdays(e.target.checked ? [...weekdays, i] : weekdays.filter((d) => d !== i))} />{day}
          </label>)}</div>
        </fieldset>}
        {frequency === 'monthly' && <Field label="Day of the month (defaults to the start day)">
          <input type="number" min={1} max={31} value={monthDay} onChange={(e) => setMonthDay(e.target.value)} />
        </Field>}
        <div className="split">
          <Field label="End date and time (optional)"><input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
          <Field label="Maximum runs (optional)"><input type="number" min={1} max={10000} value={max} onChange={(e) => setMax(e.target.value)} /></Field>
        </div>
      </>}
    </div></Panel>
    {error && <p role="alert">{error}</p>}
    {action.error && <Failure error={action.error} />}
    <div className="heading-actions">
      {close ? <Button variant="outline" type="button" onClick={close}>Cancel edit</Button> :
        <Button variant="outline" asChild><Link href={screen}>Back to campaigns</Link></Button>}
      <Button type="submit" disabled={action.isPending}>{action.isPending ? 'Saving…' : 'Save draft for review'}</Button>
    </div>
  </form>;
}

export function NewNotification() {
  const { can } = usePermissions();
  return <><Heading title="New notification campaign" description="Save a draft, then review and confirm the send." />
    {can('notifications.manage') && <Composer />}</>;
}

const executionColumns: ColumnDef<Execution>[] = [
  { header: 'Scheduled (IST)', accessorKey: 'scheduled_execution_at', cell: ({ row }) => timestamp(row.original.scheduled_execution_at) },
  { header: 'Started (IST)', accessorKey: 'started_at', cell: ({ row }) => timestamp(row.original.started_at) },
  { header: 'Finished (IST)', accessorKey: 'completed_at', cell: ({ row }) => timestamp(row.original.completed_at) },
  { header: 'Status', accessorKey: 'execution_status', cell: ({ row }) => <Badge value={row.original.execution_status} /> },
  { header: 'Devices', accessorKey: 'recipients_count' },
  { header: 'Expo tickets', accessorKey: 'successful_submissions' },
  { header: 'Not submitted', accessorKey: 'failed_submissions' },
];
const deliveryColumns: ColumnDef<Delivery>[] = [
  { header: 'Customer', accessorKey: 'customer_id', cell: ({ row }) => <RecordLink href={'/customers/' + row.original.customer_id}>{row.original.customer_id}</RecordLink> },
  { header: 'Platform', accessorKey: 'platform' },
  { header: 'Status', accessorKey: 'status', cell: ({ row }) => <Badge value={row.original.status} /> },
  { header: 'Attempts', accessorKey: 'attempts' },
  { header: 'Expo ticket', id: 'ticket', cell: ({ row }) => row.original.submission_accepted ? 'Accepted' : '—' },
  { header: 'Submitted (IST)', accessorKey: 'sent_at', cell: ({ row }) => timestamp(row.original.sent_at) },
  { header: 'Receipt checked (IST)', accessorKey: 'receipt_checked_at', cell: ({ row }) => timestamp(row.original.receipt_checked_at) },
  { header: 'Error', accessorKey: 'error_code' },
];

export function NotificationRecord({ id }: { id: string }) {
  const { can } = usePermissions();
  const path = campaignsPath + '/' + id;
  const query = useApi<Campaign>(path);
  const router = useRouter();
  const action = useAction();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<Action>();
  const [confirmed, setConfirmed] = useState(false);
  const [runPage, setRunPage] = useState(1);
  const filter = useFilters({ status: '', execution_id: '' });
  const executions = useApi<Page<Execution>>(path + '/executions', { page: runPage });
  const deliveries = useApi<Page<Delivery>>(path + '/deliveries', { ...filter.values, page: filter.page });

  function refresh() { void query.refetch(); void executions.refetch(); void deliveries.refetch(); }
  function prompt(value: Action) { action.reset(); setConfirm(value); setConfirmed(false); }
  async function apply() {
    if (!confirm) return;
    try {
      if (confirm === 'delete') {
        await action.mutateAsync({ path, method: 'DELETE' });
        router.push(screen);
      } else {
        await action.mutateAsync({ path: path + '/actions/' + confirm, method: 'POST', body: { confirm_broadcast: confirmed } });
      }
      setConfirm(undefined);
    } catch { /* The dialog displays the API error. */ }
  }
  return <Resource query={query}>{(data) => {
    const broadcast = data.recipient_type === 'all_customers';
    const actions: Action[] = [];
    if (can('notifications.manage')) {
      if (data.status === 'draft') {
        if (!broadcast || can('notifications.broadcast')) actions.push(data.schedule.mode === 'now' ? 'send' : 'schedule');
        actions.push('delete');
      }
      if (data.schedule.mode === 'repeat' && ['scheduled', 'active'].includes(data.status)) actions.push('pause');
      if (data.status === 'paused' && (!broadcast || can('notifications.broadcast'))) actions.push('resume');
      if (['scheduled', 'active', 'paused'].includes(data.status)) actions.push('cancel');
    }
    const needsBroadcast = broadcast && ['send', 'schedule', 'resume'].includes(confirm ?? '');
    return <>
      <Heading title={data.title} description="Campaign details, executions and delivery receipts." actions={<>
        <Button variant="outline" asChild><Link href={screen}>All campaigns</Link></Button>
        <Refresh run={refresh} busy={query.isFetching || executions.isFetching || deliveries.isFetching} />
      </>} />
      {editing ? <Composer campaign={data} close={() => setEditing(false)} /> : <>
        <Panel title="Campaign" action={<Badge value={data.status} />}>
          <div className="panel-body grid gap-3">
            <p className="whitespace-pre-wrap break-words">{data.message}</p>
            <Details items={[
              ['Audience', audience(data)], ['Category', label(data.notification_type)], ['Schedule', label(data.schedule.mode)],
              ['Timezone', data.schedule.timezone], ['Start', localInput(data.schedule.start_at, data.schedule.timezone).replace('T', ' ') || null],
              ['Repeat', data.schedule.frequency ? `Every ${data.schedule.interval} · ${label(data.schedule.frequency)}` : null],
              ['End', localInput(data.schedule.end_at, data.schedule.timezone).replace('T', ' ') || null],
              ['Maximum runs', data.schedule.max_occurrences], ['Next run', timestamp(data.next_run_at, data.schedule.timezone)], ['Runs', data.occurrence_count],
              ['Created by', data.created_by_admin_id],
              ['Opens', data.destination ? label(data.destination) : 'No specific page'],
            ]} />
            <div className="heading-actions">
              {can('notifications.manage') && (data.status === 'draft' || (data.status === 'scheduled' && !data.occurrence_count)) &&
                <Button variant="outline" onClick={() => setEditing(true)}>Edit draft</Button>}
              {actions.map((name) => <Button key={name} variant={name === 'send' || name === 'schedule' ? 'default' : 'outline'}
                onClick={() => prompt(name)}>{name === 'send' ? 'Send now' : label(name)}</Button>)}
            </div>
          </div>
        </Panel>
        <Panel title="Execution history" description="Tickets show what Expo accepted for processing. Receipts are tracked separately.">
          <Resource query={executions}>{(page) => <><Table columns={executionColumns} rows={page.items} empty="No executions yet" />
            <Pager data={page} change={setRunPage} /></>}</Resource>
        </Panel>
        <Panel title="Delivery log" description="A provider receipt does not confirm the customer saw the message.">
          <div className="toolbar">
            <SelectFilter label="Delivery status" all="All statuses" value={filter.values.status}
              choices={options(deliveryStates)} onChange={(value) => filter.set('status', value)} />
            <SelectFilter label="Execution (current history page)" all="All executions" value={filter.values.execution_id}
              choices={(executions.data?.items ?? []).map((run) => ({ value: run.id, label: timestamp(run.scheduled_execution_at) }))}
              onChange={(value) => filter.set('execution_id', value)} />
          </div>
          <Resource query={deliveries}>{(page) => <><Table columns={deliveryColumns} rows={page.items} empty="No matching deliveries" />
            <Pager data={page} change={filter.setPage} /></>}</Resource>
        </Panel>
      </>}
      {confirm && <Modal title={label(confirm) + ' campaign'} open onOpenChange={(open) => { if (!open && !action.isPending) setConfirm(undefined); }}
        description={confirm === 'cancel' ? 'Stops future runs and unsent deliveries. Messages already in flight may still arrive.' :
          confirm === 'pause' ? 'Pauses future runs. A run already in progress may finish.' :
          confirm === 'delete' ? 'Permanently removes this unsent draft.' : `${data.title} · ${audience(data)}.`}>
        <div className="dialog-body grid gap-3">
          {needsBroadcast && <label className="flex items-center gap-2">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I confirm this campaign can reach every eligible customer device.
          </label>}
          {action.error && <Failure error={action.error} />}
          <div className="heading-actions">
            <Button variant="outline" disabled={action.isPending} onClick={() => setConfirm(undefined)}>Go back</Button>
            <Button disabled={action.isPending || (needsBroadcast && !confirmed)} onClick={() => { void apply(); }}>
              {action.isPending ? 'Working…' : `Confirm ${confirm}`}
            </Button>
          </div>
        </div>
      </Modal>}
    </>;
  }}</Resource>;
}
