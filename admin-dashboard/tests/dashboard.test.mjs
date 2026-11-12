import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const fixture = JSON.parse(process.env.SOLAR_ADMIN_FIXTURE ?? '{}');

function browser() {
  let cookie = '';
  let bearer = '';
  async function send(path, { method = 'GET', body, status = 200, origin = fixture.dashboard, token = bearer, sendCookie = true } = {}) {
    const response = await fetch(fixture.dashboard + '/api/v1' + path, {
      method, redirect: 'manual',
      headers: {
        ...(method === 'GET' ? {} : { Origin: origin }),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(sendCookie && cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, status, method + ' ' + path + ': ' + (response.status === status ? '' : await response.text()));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const setCookie = response.headers.get('Set-Cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const data = status === 204 ? undefined : await response.json();
    if (data?.tokens) {
      assert.equal(data.tokens.refresh_token, null);
      bearer = data.tokens.access_token;
      assert.ok(setCookie?.includes('HttpOnly'));
      assert.ok(setCookie?.includes('SameSite=strict'));
      assert.ok(setCookie?.includes('Path=/api/v1/admin/auth'));
    }
    return data;
  }
  return { send, get cookie() { return cookie; }, get bearer() { return bearer; } };
}

async function seedCustomer(phone) {
  const register = await fetch(fixture.api + '/customers/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: 'Local Test Customer', phone_number: phone,
      installation_credential: randomBytes(32).toString('base64url') }),
  });
  assert.equal(register.status, 201);
  return register.json();
}

async function seedBooking(customer) {
  const address = { address_line: 'Test address', city: 'Kochi', district: 'Ernakulam', postal_code: '682001',
    location_source: 'manual' };
  const post = (path, body) => fetch(fixture.api + path, {
    method: 'POST', headers: { Authorization: 'Bearer ' + customer.tokens.access_token,
      'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body),
  });
  const saved = await post('/customers/me/addresses', { ...address, label: 'Roof' });
  assert.equal(saved.status, 201);
  const booking = await post('/bookings', { service_id: fixture.service_id, service_date: fixture.date,
    saved_address_id: (await saved.json()).id, customer_instructions: 'Use the side gate.' });
  assert.equal(booking.status, 201);
  return booking.json();
}

test('booking and administration flows through Next.js and FastAPI', { skip: !fixture.dashboard }, async () => {
  const owner = browser();
  const { send } = owner;
  await send('/admin/me', { status: 401 });
  await send('/customers/me', { status: 404 });
  await send('/services', { method: 'POST', status: 404 });
  await send('/admin/auth/login', { method: 'POST', body: { email: fixture.email, password: fixture.password },
    origin: 'https://foreign.example', status: 403 });
  const login = await send('/admin/auth/login', { method: 'POST', body: {
    email: fixture.email, password: fixture.password, transport: 'token',
  } });
  assert.equal(login.admin.role, 'owner');
  assert.ok(login.admin.permissions.includes('bookings.assign'));
  const previousToken = owner.bearer;
  const previousCookie = owner.cookie;
  await send('/admin/auth/refresh', { method: 'POST' });
  assert.notEqual(owner.cookie, previousCookie);
  await send('/admin/me', { token: previousToken, status: 401 });
  assert.equal((await send('/admin/me')).id, login.admin.id);

  const staffPassword = 'Staff-fixture-24!sunrise';
  const staff = await send('/admin/users', { method: 'POST', status: 201,
    body: { full_name: 'Test Staff', email: 'staff@example.com', password: staffPassword, role: 'staff' } });
  assert.equal((await send('/admin/users/' + staff.id)).role, 'staff');
  const staffClient = browser();
  await staffClient.send('/admin/auth/login', { method: 'POST', body: { email: staff.email, password: staffPassword } });
  await staffClient.send('/admin/dashboard/summary');
  await staffClient.send('/admin/customers', { status: 403 });
  await staffClient.send('/admin/technicians', { status: 403 });
  await staffClient.send('/admin/users', { status: 403 });

  const customer = await seedCustomer('9000000201');
  const campaigns = '/admin/notifications/campaigns';
  await staffClient.send(campaigns, { status: 403 });
  const draft = await send(campaigns, { method: 'POST', status: 201, body: {
    request_id: randomUUID(), title: 'Dashboard fixture', message: 'Queued locally with no push provider.',
    recipient_type: 'selected_customers', customer_ids: [customer.customer.id],
  } });
  const campaign = `${campaigns}/${draft.id}`;
  assert.equal(draft.status, 'draft');
  assert.equal((await send(campaigns + '?search=Dashboard')).total, 1);
  await send(campaign + '/actions/send', { method: 'POST', origin: 'https://foreign.example', body: {}, status: 403 });
  assert.equal((await send(campaign + '/actions/send', { method: 'POST', body: {} })).status, 'scheduled');
  assert.equal((await send('/admin/notifications/stats')).scheduled, 1);
  assert.equal((await send(campaign + '/executions')).total, 0);
  assert.equal((await send(campaign + '/deliveries')).total, 0);
  assert.equal((await send(campaign + '/actions/cancel', { method: 'POST', body: {} })).status, 'cancelled');
  const booking = await seedBooking(customer);
  const second = await seedBooking(customer);
  const bookingPath = '/admin/bookings/' + booking.id;
  const bookings = await send('/admin/bookings?page_size=1');
  assert.equal(bookings.total, 2);
  assert.equal(bookings.has_next, true);
  assert.equal((await send('/admin/bookings?search=' + booking.booking_reference)).items[0].id, booking.id);
  assert.equal((await send(bookingPath)).estimated_amount, '550.00');
  await staffClient.send(bookingPath + '/status', { method: 'PATCH', body: { status: 'confirmed' }, status: 403 });
  assert.equal((await send(bookingPath + '/status', { method: 'PATCH', body: { status: 'confirmed' } })).status, 'confirmed');
  assert.equal((await send('/admin/bookings/' + second.id + '/cancel', {
    method: 'POST', body: { reason: 'Fixture cancellation' },
  })).status, 'cancelled');

  const note = await send(bookingPath + '/notes', { method: 'POST', status: 201, body: { note: 'Fixture internal note' } });
  await staffClient.send(bookingPath + '/notes', { status: 403 });
  assert.equal((await send(bookingPath + '/notes')).items[0].note, note.note);
  await send(bookingPath + '/notes/' + note.id, { method: 'PATCH', body: { note: 'Updated fixture note' } });
  await send(bookingPath + '/notes/' + note.id, { method: 'DELETE', status: 204 });

  const tech = async (name, phone) => send('/admin/technicians', {
    method: 'POST', status: 201, body: { full_name: name, primary_phone: phone },
  });
  const a = await tech('Field Technician A', '9110000201');
  const b = await tech('Field Technician B', '9110000202');
  await send('/admin/technicians/' + a.id, { method: 'PATCH', body: { city: 'Kochi' } });
  for (const record of [a, b]) {
    await send('/admin/technicians/' + record.id + '/availability', { method: 'PUT',
      body: { availability_date: fixture.date, availability_status: 'available', start_time: '09:00', end_time: '17:00' } });
  }
  assert.equal((await send(bookingPath + '/eligible-technicians')).total, 2);
  await send(bookingPath + '/assign', { method: 'POST', status: 201, body: { technician_id: a.id } });
  assert.equal((await send('/admin/bookings?technician_id=' + a.id)).total, 1);
  assert.equal((await send('/admin/bookings?technician_id=' + b.id)).total, 0);
  const eligible = await send(bookingPath + '/eligible-technicians?mode=reassign');
  assert.deepEqual(eligible.items.map((item) => item.id), [b.id]);
  await send(bookingPath + '/reassign', { method: 'POST', status: 201,
    body: { new_technician_id: b.id, reassignment_reason: 'Fixture handover' } });
  assert.equal((await send('/admin/bookings?technician_id=' + a.id)).total, 0);
  assert.equal((await send('/admin/bookings?technician_id=' + b.id)).total, 1);
  await send(bookingPath + '/unassign', { method: 'POST', body: { reason: 'Fixture unassignment' } });
  assert.equal((await send(bookingPath + '/assignments')).total, 2);
  const leave = await send('/admin/technicians/' + a.id + '/leave', { method: 'POST', status: 201,
    body: { start_date: fixture.date, end_date: fixture.date } });
  await send('/admin/technicians/' + a.id + '/leave/' + leave.id, { method: 'PATCH', body: { reason: 'Updated fixture leave' } });
  assert.equal((await send(bookingPath + '/eligible-technicians')).total, 1);
  await send('/admin/technicians/' + a.id + '/leave/' + leave.id, { method: 'DELETE', status: 204 });
  await send('/admin/technicians/' + a.id + '/deactivate', { method: 'POST' });
  assert.equal((await send('/admin/technicians/' + a.id)).is_active, false);
  await send('/admin/technicians/' + a.id + '/activate', { method: 'POST' });
  assert.equal((await send('/admin/technicians/workload')).total, 2);

  const person = '/admin/customers/' + customer.customer.id;
  assert.equal((await send(person)).saved_addresses.total, 2);
  assert.equal((await send(person + '/bookings')).total, 2);
  assert.equal((await send('/admin/customers?search=Local')).total, 1);
  await send(person, { method: 'PATCH', body: { full_name: 'Updated Customer' } });
  assert.equal((await send(person + '/deactivate', { method: 'POST' })).is_active, false);
  assert.equal((await send(person + '/activate', { method: 'POST' })).is_active, true);
  assert.equal((await send('/services')).total, 1);
  assert.equal((await send('/services/' + fixture.service_id + '/pricing')).base_price, '550.00');
  assert.equal((await send('/business')).timezone, 'Asia/Kolkata');
  assert.equal((await send('/business/operating-hours')).days.length, 1);
  assert.equal((await send('/service-areas')).total, 0);
  assert.equal((await send('/admin/dashboard/summary')).total_bookings, 2);
  assert.equal((await send('/admin/dashboard/bookings-analytics?interval=month')).cancelled, 1);

  const followUpCustomer = await seedCustomer('9000000202');
  const pendingResponse = await fetch(fixture.api + '/bookings', {
    method: 'POST', headers: { Authorization: 'Bearer ' + followUpCustomer.tokens.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_id: fixture.service_id }),
  });
  assert.equal(pendingResponse.status, 201);
  const pending = await pendingResponse.json();
  const pendingPath = '/admin/bookings/' + pending.id;
  assert.equal((await send('/admin/bookings?search=' + pending.booking_reference)).items[0].address_summary, null);
  assert.equal((await send(pendingPath)).address, null);
  assert.equal((await send('/admin/dashboard/summary')).recent_created.find((row) => row.id === pending.id).service_date, null);
  await send(pendingPath + '/status', { method: 'PATCH', body: { status: 'confirmed' }, status: 409 });
  await staffClient.send(pendingPath + '/follow-up', { method: 'PATCH', body: { service_date: fixture.date }, status: 403 });
  const followUp = await send(pendingPath + '/follow-up', { method: 'PATCH', body: {
    service_date: fixture.date, address: { address_line: 'Opposite the post office', location_source: 'manual' },
  } });
  assert.equal(followUp.service_date, fixture.date);
  assert.equal(followUp.address.address_line, 'Opposite the post office');
  assert.equal((await send(pendingPath + '/status', { method: 'PATCH', body: { status: 'confirmed' } })).status, 'confirmed');

  await staffClient.send('/admin/me', { method: 'PATCH', body: { full_name: 'Updated Staff' } });
  await staffClient.send('/admin/auth/change-password', { method: 'POST',
    body: { current_password: staffPassword, new_password: 'Staff-fixture-25!sunrise' } });
  await staffClient.send('/admin/auth/logout-all', { method: 'POST' });
  await staffClient.send('/admin/auth/refresh', { method: 'POST', status: 401 });
  await send('/admin/users/' + staff.id + '/deactivate', { method: 'POST' });
  assert.equal((await send('/admin/users/' + staff.id)).is_active, false);
  await send('/admin/auth/logout', { method: 'POST' });
  await send('/admin/me', { status: 401 });
});

