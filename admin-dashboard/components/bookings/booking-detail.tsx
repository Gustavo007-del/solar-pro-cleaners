'use client';

import Link from 'next/link';
import { ArrowLeft, MapPin, Plus, UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormDialog, noteRule, optional } from '@/components/forms';
import { Badge, Details, Empty, Heading, Panel, Pager, Refresh, Resource, RecordLink } from '@/components/shared';
import { useApi, useAction } from '@/hooks/use-api';
import { dateText, label, mapsLink, money, timestamp } from '@/lib/utils';
import { usePermissions } from '@/providers/app-providers';
import { routes } from '@/services/routes';
import type { Assignment, Booking, Note, Page } from '@/types/api';
import { AssignmentDialog, AssignmentTable } from './assignment-workflow';

type BookingAction = 'confirm' | 'complete' | 'cancel' | 'assign' | 'reassign' | 'unassign';

export function BookingDetail({ id }: { id: string }) {
  const query = useApi<Booking>(routes.booking(id));
  return <>
    <Button asChild variant="ghost" size="sm"><Link href="/bookings"><ArrowLeft size={16} />Back to bookings</Link></Button>
    <Resource query={query}>{(booking) => <BookingRecord booking={booking} refresh={() => void query.refetch()} busy={query.isFetching} />}</Resource>
  </>;
}

function BookingRecord({ booking, refresh, busy }: { booking: Booking; refresh: () => void; busy: boolean }) {
  const { can } = usePermissions();
  const [selected, setSelected] = useState<BookingAction>();
  const action = useAction();
  const assignmentHistory = useApi<Page<Assignment>>(routes.assignments(booking.id), { page_size: 1 },
    !booking.current_assignment && can('technicians.assignments.read') && (
      (booking.status === 'in_progress' && can('bookings.update')) || (booking.status === 'confirmed' && can('bookings.reassign'))
    ));
  const { address, pricing, status, current_assignment: current } = booking;
  const map = mapsLink(address.google_maps_url);
  const allowAssign = can('technicians.assignments.manage', 'bookings.assign') && status === 'confirmed' && !current;
  const allowReassign = can('technicians.assignments.manage', 'bookings.reassign') && (
    (Boolean(current) && ['assigned','in_progress'].includes(status)) || (status === 'confirmed' && (assignmentHistory.data?.total ?? 0) > 0)
  );
  const allowUnassign = can('technicians.assignments.manage', 'bookings.unassign') && Boolean(current) && ['assigned','in_progress'].includes(status);
  const allowComplete = can('bookings.update') && status === 'in_progress' && assignmentHistory.data?.total === 0;
  const allowCancel = can('bookings.cancel') && ['pending', 'confirmed'].includes(status);
  const primary = selected === 'confirm' ? 'Confirm booking' : selected === 'complete' ? 'Complete booking' : 'Cancel booking';

  return <>
    <Heading title={booking.booking_reference} description={booking.service_name + ' · ' + dateText(booking.service_date)}
      actions={<><Badge value={status} /><Refresh run={refresh} busy={busy} /></>} />
    <div className="wide-split">
      <div className="stack">
        <Panel title="Booking details"><div className="panel-body"><Details items={[
          ['Service', booking.service_name], ['Requested date', dateText(booking.service_date)], ['Submitted', timestamp(booking.created_at)],
          ['Customer', can('customers.read') ? <RecordLink href={'/customers/' + booking.customer_id}>{booking.customer.full_name}</RecordLink> : booking.customer.full_name],
          ['Phone', booking.customer.phone_number], ['Alternate phone', booking.customer.alternate_phone_number],
          ['Instructions', booking.customer_instructions], ['Cancellation reason', booking.cancellation_reason],
        ]} /></div></Panel>
        <Panel title="Location" action={map && <Button asChild variant="outline" size="sm"><a href={map} target="_blank" rel="noopener noreferrer"><MapPin size={15} />Google Maps</a></Button>}>
          <div className="panel-body"><Details items={[
            ['Address', [address.address_line, address.address_line_2, address.locality, address.city, address.district, address.state, address.postal_code].filter(Boolean).join(', ')],
            ['Landmark', address.landmark], ['Recipient', address.recipient_name], ['Recipient phone', address.recipient_phone],
            ['GPS coordinates', address.latitude != null && address.longitude != null ? `${address.latitude}, ${address.longitude}` : '—'],
          ]} /></div>
        </Panel>
        <Panel title="Status history">
          {booking.history.length === 0 ? <Empty title="No status changes recorded" /> : <ol className="activity-list">{booking.history.map((event, index) =>
            <li key={index}><span className="timeline-dot" /><div><Badge value={event.new_status} /><p>{event.changed_by_name ?? label(event.changed_by_type)} · {timestamp(event.created_at)}</p>
              {event.reason && <p>{event.reason}</p>}</div></li>)}</ol>}
        </Panel>
      </div>
      <div className="stack">
        <Panel title="Actions"><div className="panel-body actions">
          {can('bookings.update') && status === 'pending' && <Button onClick={() => setSelected('confirm')}>Confirm booking</Button>}
          {allowComplete && <Button onClick={() => setSelected('complete')}>Mark complete</Button>}
          {allowCancel && <Button variant="outline" onClick={() => setSelected('cancel')}>Cancel booking</Button>}
          {allowAssign && <Button onClick={() => setSelected('assign')}><UserRoundCheck size={16} />Assign technician</Button>}
          {allowReassign && <Button variant="outline" onClick={() => setSelected('reassign')}>Reassign</Button>}
          {allowUnassign && <Button variant="outline" onClick={() => setSelected('unassign')}>Unassign</Button>}
          {!(allowComplete || allowCancel || allowAssign || allowReassign || allowUnassign || (can('bookings.update') && status === 'pending'))
            && <p className="muted small">No actions available for this booking.</p>}
        </div></Panel>
        <Panel title="Current assignment"><div className="panel-body">
          {current ? <Details items={[['Technician', can('technicians.read')
            ? <RecordLink href={'/technicians/' + current.technician_id}>{current.technician_name}</RecordLink> : current.technician_name],
          ['Status', <Badge value={current.assignment_status} />]]} /> : <p className="muted small">No current assignment.</p>}
        </div></Panel>
        <Panel title="Pricing snapshot"><div className="panel-body"><Details items={[
          ['Pricing model', label(pricing.pricing_type)], ['Estimate', money(booking.estimated_amount, booking.currency)],
          ['Base price', money(pricing.base_price, pricing.currency)], ['Per panel', money(pricing.price_per_panel, pricing.currency)],
          ['Minimum', money(pricing.minimum_charge, pricing.currency)], ['Panel quantity', pricing.panel_quantity],
        ]} /></div></Panel>
      </div>
    </div>
    {can('technicians.assignments.read') && <Panel title="Assignment history"><AssignmentTable path={routes.assignments(booking.id)} /></Panel>}
    {can('bookings.notes.read') && <BookingNotes id={booking.id} legacy={booking.legacy_admin_notes} />}
    {selected && ['assign', 'reassign', 'unassign'].includes(selected) && <AssignmentDialog booking={booking}
      mode={selected as 'assign' | 'reassign' | 'unassign'} close={() => setSelected(undefined)} />}
    {selected && ['confirm', 'complete', 'cancel'].includes(selected) && <FormDialog title={primary}
      description={selected === 'cancel' ? 'Cancellation ends this request. The reason can be seen by the customer.' : undefined}
      fields={selected === 'cancel' ? [{ name: 'reason', label: 'Cancellation reason', type: 'textarea', rule: noteRule }] : []}
      close={() => setSelected(undefined)} submitLabel={primary} destructive={selected === 'cancel'}
      submit={(values) => action.mutateAsync(selected === 'cancel'
        ? { path: routes.cancelBooking(booking.id), method: 'POST', body: { reason: optional(values.reason) } }
        : { path: routes.bookingStatus(booking.id), method: 'PATCH', body: { status: selected === 'confirm' ? 'confirmed' : 'completed' } })} />}
  </>;
}

function BookingNotes({ id, legacy }: { id: string; legacy: string | null }) {
  const { profile, can } = usePermissions();
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<{ note?: Note; remove?: boolean }>();
  const query = useApi<Page<Note>>(routes.notes(id), { page });
  const action = useAction();
  return <Panel title="Internal notes" action={can('bookings.notes.create') && <Button size="sm" onClick={() => setEdit({})}><Plus size={15} />Add note</Button>}>
    {legacy && <div className="panel-body small"><strong>Legacy note</strong><p className="prewrap">{legacy}</p></div>}
    <Resource query={query}>{(data) => <>
      {data.items.length === 0 ? <Empty title="No internal notes" /> : <ul className="note-list">{data.items.map((note) =>
        <li key={note.id}><div><strong>{note.admin_id === profile?.id ? profile.full_name : 'Administrator'}</strong>
          <p className="muted small">{timestamp(note.created_at)}</p><p className="prewrap">{note.note}</p></div>
          <div className="actions">
            {can('bookings.notes.update') && (profile?.role === 'owner' || note.admin_id === profile?.id)
              && <Button variant="outline" size="sm" onClick={() => setEdit({ note })}>Edit</Button>}
            {can('bookings.notes.delete') && <Button variant="ghost" size="sm" onClick={() => setEdit({ note, remove: true })}>Delete</Button>}
          </div>
        </li>)}</ul>}
      <Pager data={data} change={setPage} />
    </>}</Resource>
    {edit && <FormDialog title={edit.remove ? 'Delete note' : edit.note ? 'Edit note' : 'Add internal note'}
      description={edit.remove ? 'Delete this private note from the booking?' : 'Visible only to authorized administrators.'}
      fields={edit.remove ? [] : [{ name: 'note', label: 'Note', type: 'textarea', required: true, initial: edit.note?.note,
        rule: z.string().trim().min(1).max(4000, 'Use up to 4,000 characters.') }]}
      close={() => setEdit(undefined)} destructive={edit.remove} submitLabel={edit.remove ? 'Delete note' : 'Save note'}
      submit={(values) => action.mutateAsync({
        path: edit.note ? routes.note(id, edit.note.id) : routes.notes(id),
        method: edit.remove ? 'DELETE' : edit.note ? 'PATCH' : 'POST',
        body: edit.remove ? undefined : { note: values.note.trim() },
      })} />}
  </Panel>;
}

