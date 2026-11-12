const assert = require('node:assert/strict');
const { createHash, createHmac, randomBytes, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const fixture = JSON.parse(process.env.SOLAR_TEST_FIXTURE ?? '{}');
const project = path.resolve(__dirname, '..');

// Load the application modules with native storage and entropy adapters while keeping real HTTP.
function mobile(storage = new Map()) {
  const modules = new Map();
  const requests = [];
  const transport = { dropResponseFor: undefined, forceStatus: undefined, invalidResponse: false, stall: false };
  const native = {
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      getItemAsync: async (key) => storage.get(key) ?? null,
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async (key) => { storage.delete(key); },
    },
    'expo-crypto': {
      CryptoDigestAlgorithm: { SHA256: 'sha256' },
      digestStringAsync: async (algorithm, value) => createHash(algorithm).update(value).digest('hex'),
      getRandomBytesAsync: async (count) => randomBytes(count),
      randomUUID,
    },
    '@/constants/config': { appConfig: { api: { baseUrl: fixture.base } } },
  };
  async function mobileFetch(url, init) {
    const route = new URL(url).pathname;
    requests.push({ route, method: init.method });
    if (transport.stall) return new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
    if (transport.forceStatus) return new Response('gateway error', {
      status: transport.forceStatus, headers: transport.forceStatus === 429 ? { 'Retry-After': '3' } : undefined,
    });
    if (transport.invalidResponse) return new Response('not JSON');
    const response = await fetch(url, init);
    if (transport.dropResponseFor === route && init.method === 'POST') {
      transport.dropResponseFor = undefined;
      await response.text();
      throw new TypeError('Simulated lost connection after server response');
    }
    return response;
  }
  function load(filename) {
    const real = filename.endsWith('.ts') ? filename : filename + '.ts';
    if (modules.has(real)) return modules.get(real).exports;
    const module = { exports: {} };
    modules.set(real, module);
    const { outputText } = ts.transpileModule(fs.readFileSync(real, 'utf8'), {
      fileName: real, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    new Function('module', 'exports', 'require', 'fetch', 'setTimeout', outputText)(module, module.exports, (id) => {
      if (id in native) return native[id];
      if (id.startsWith('@/')) return load(path.join(project, 'src', id.slice(2)));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(real), id));
      return require(id);
    }, mobileFetch, (handler, delay) => setTimeout(handler, transport.stall ? 25 : delay));
    return module.exports;
  }
  const source = (name) => load(path.join(project, 'src/services', name));
  return {
    ...source('api/session'), ...source('api/customerSchemas'), ...source('api/catalogue'),
    ...source('api/client'), ...source('api/addresses'), ...source('bookings/bookingService'),
    ...source('bookings/submissionJournal'), storage, requests, transport,
  };
}

async function raw(route, { token, body, method } = {}) {
  return fetch(fixture.base + route, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function sessionRecord(client) {
  return JSON.parse([...client.storage.entries()].find(([key]) => key.startsWith('solar-care.session.'))[1]);
}

const is = (status, code) => (error) => error.status === status && (!code || error.code === code);

test('customer mobile contracts against PostgreSQL', { skip: !fixture.base }, async () => {
  let app = mobile();
  assert.deepEqual(await app.sessionService.restore(), { knownInstallation: false });
  const first = await app.sessionService.register({ fullName: 'Test Customer', primaryPhone: '9000000001' });
  const original = sessionRecord(app);
  assert.match(original.installation, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(original.installation, 'base64url').length, 32);
  const duplicate = await raw('/customers/register', { body: {
    full_name: 'Duplicate', phone_number: '9000000001', installation_credential: original.installation,
  } });
  assert.equal(duplicate.status, 409);
  app = mobile(app.storage);
  assert.equal((await app.sessionService.restore()).profile.id, first.id);

  const actualTime = Date.now;
  Date.now = () => actualTime() + 20 * 60 * 1000;
  try {
    await Promise.all(Array.from({ length: 4 }, () => app.customerRequest('/customers/me', app.profileSchema)));
  } finally { Date.now = actualTime; }
  assert.equal(app.requests.filter(({ route }) => route.endsWith('/auth/refresh')).length, 1);
  assert.notEqual(sessionRecord(app).tokens.refresh_token, original.tokens.refresh_token);
  assert.equal((await raw('/customers/auth/refresh', { body: { refresh_token: original.tokens.refresh_token } })).status, 401);
  // The server revoked the family when the old token was replayed. The app can recover by installation login.
  assert.equal((await app.customerRequest('/customers/me', app.profileSchema)).id, first.id);
  app.transport.dropResponseFor = '/api/v1/customers/auth/refresh';
  Date.now = () => actualTime() + 20 * 60 * 1000;
  try {
    await assert.rejects(app.customerRequest('/customers/me', app.profileSchema), (error) => error.code === 'network');
  } finally { Date.now = actualTime; }
  assert.equal(sessionRecord(app).tokens, undefined);
  app = mobile(app.storage);
  assert.equal((await app.sessionService.restore()).profile.id, first.id);
  assert.ok(app.requests.some(({ route }) => route.endsWith('/auth/login')));
  const active = sessionRecord(app);
  const [header, payload] = active.tokens.access_token.split('.');
  const expired = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), exp: 1 };
  const signed = header + '.' + Buffer.from(JSON.stringify(expired)).toString('base64url');
  const signature = createHmac('sha256', process.env.JWT_SIGNING_SECRET).update(signed).digest('base64url');
  assert.equal((await raw('/customers/me', { token: signed + '.' + signature })).status, 401);
  const profile = await app.customerRequest('/customers/me', app.profileSchema, {
    method: 'PATCH', body: { full_name: 'Updated Customer', alternate_phone_number: '9000000003' },
  });
  assert.equal(profile.alternate_phone_number, '+919000000003');
  assert.equal((await app.customerRequest('/customers/me/account', app.accountSchema)).id, first.id);
  assert.equal((await raw('/admin/me', { token: sessionRecord(app).tokens.access_token })).status, 401);

  const services = await app.catalogue.services();
  assert.equal(services.total, 5);
  assert.equal(services.items[0].id, fixture.service);
  await assert.rejects(app.catalogue.service(fixture.hidden), is(404));
  const service = await app.catalogue.service(fixture.service);
  assert.equal(service.pricing.minimum_charge, '100.00');
  assert.equal((await app.catalogue.service(fixture.fixed)).pricing.base_price, '450.00');
  assert.deepEqual((await app.catalogue.service(fixture.quote)).pricing, {
    pricing_type: 'custom_quote', currency: 'INR', base_price: null, price_per_panel: null, minimum_charge: null,
  });
  assert.equal((await app.catalogue.service(fixture.unpriced)).pricing, null);
  assert.equal((await app.catalogue.areas()).items[0].name, 'Test PIN');
  assert.equal((await app.catalogue.checkArea({ postal_code: '682001' })).covered, true);
  assert.equal((await app.catalogue.business()).business_name, 'Integration Test Business');
  assert.equal((await app.catalogue.hours()).timezone, 'Asia/Kolkata');
  assert.equal((await app.catalogue.closures()).items[0].closure_date, fixture.closureDate);
  assert.equal((await app.catalogue.availability(fixture.service, fixture.closureDate, { postal_code: '682001' })).reason, 'closure');

  const address = { formattedAddress: '10 Test Street, Kochi', houseName: '10 Test Street', locality: null,
    city: 'Kochi', district: null, state: 'Kerala', pinCode: '682001', landmark: null };
  const gps = { method: 'gps', coordinates: { latitude: 9.93000001, longitude: 76.27 }, address, isAddressManuallyEdited: false };
  const manual = { method: 'manual', coordinates: null, address, isAddressManuallyEdited: false };
  assert.equal((await app.addresses.coverage(gps)).is_covered, true);
  assert.equal((await app.addresses.coverage({ ...manual, address: { ...address, pinCode: '123456' } })).is_covered, false);
  const saved = await app.addresses.create(gps, 'Roof');
  const manualSaved = await app.addresses.create(manual);
  assert.equal(manualSaved.latitude, null);
  assert.equal((await app.addresses.makeDefault(saved.id)).is_default, true);
  const located = await app.addresses.read(saved.id);
  assert.equal(located.latitude, 9.93000001);
  assert.match(located.google_maps_url, /^https:\/\/www\.google\.com\/maps\//);
  assert.equal((await app.addresses.list()).items[0].id, saved.id);
  await app.addresses.remove(manualSaved.id);
  await assert.rejects(app.addresses.read(manualSaved.id), is(404));

  const input = { service_id: fixture.service, service_date: fixture.serviceDate, saved_address_id: saved.id,
    customer_instructions: 'Test instructions', pricing: { panel_quantity: 3 } };
  const closed = { ...input, service_date: fixture.closureDate };
  await assert.rejects(app.bookingService.createBooking(closed, randomUUID()), is(409, 'service_date_unavailable'));
  await assert.rejects(app.bookingService.createBooking({ ...input, pricing: {} }, randomUUID()), is(422, 'panel_quantity_required'));
  const key = await app.prepareSubmission(first.id, input);
  app.transport.dropResponseFor = '/api/v1/bookings';
  await assert.rejects(app.bookingService.createBooking(input, key), (error) => error.code === 'network');
  app = mobile(app.storage);
  await app.sessionService.restore();
  assert.equal(await app.prepareSubmission(first.id, input), key);
  const booking = await app.bookingService.createBooking(input, key);
  await app.resolveSubmission(first.id, key);
  assert.equal(booking.status, 'pending');
  assert.equal(booking.estimatedAmount, '100.00');
  assert.equal(booking.pricing.panel_quantity, 3);
  assert.equal((await app.bookingService.list('all', 1)).status_counts.pending, 1);
  assert.equal((await app.bookingService.list('pending', 1)).total, 1);
  assert.equal((await app.bookingService.list('all', 2)).status_counts, null);
  assert.equal((await app.bookingService.list('completed', 1)).total, 0);
  await assert.rejects(app.bookingService.createBooking({ ...input, customer_instructions: 'Changed' }, key), is(409, 'idempotency_conflict'));

  const updated = await app.addresses.update(saved.id, { ...gps, isAddressManuallyEdited: true, address: { ...address, houseName: 'Changed street' } });
  assert.equal(updated.location_source, 'gps_with_manual_address');
  assert.equal((await app.bookingService.getBookingById(booking.id)).location.address.formattedAddress, booking.location.address.formattedAddress);
  const other = mobile();
  await other.sessionService.register({ fullName: 'Other Customer', primaryPhone: '9000000002' });
  await assert.rejects(other.addresses.read(saved.id), is(404));
  assert.equal(await other.bookingService.getBookingById(booking.id), undefined);
  await assert.rejects(other.bookingService.cancel(booking.id), is(404));
  assert.equal((await other.bookingService.list('all', 1)).total, 0);
  const cancelled = await app.bookingService.cancel(booking.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.history.map((event) => event.status), ['pending', 'cancelled']);

  const next = await app.bookingService.createBooking(input, randomUUID());
  const adminResponse = await raw('/admin/auth/login', { body: {
    email: process.env.ADMIN_BOOTSTRAP_EMAIL, password: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  } });
  assert.equal(adminResponse.status, 200);
  const admin = (await adminResponse.json()).tokens.access_token;
  assert.equal((await raw('/customers/me', { token: admin })).status, 401);
  assert.equal((await raw('/admin/bookings/' + next.id + '/status', {
    token: admin, method: 'PATCH', body: { status: 'confirmed' },
  })).status, 200);
  const confirmed = await app.bookingService.getBookingById(next.id);
  assert.equal(confirmed.status, 'confirmed');
  assert.ok(confirmed.confirmedAt);
  assert.equal(confirmed.technician, null);
  const techResponse = await raw('/admin/technicians', { token: admin, body: {
    full_name: 'Assigned Technician', primary_phone: '+919110000201', email: 'private-tech@example.com',
  } });
  assert.equal(techResponse.status, 201);
  const tech = await techResponse.json();
  assert.equal((await raw('/admin/technicians/' + tech.id + '/availability', {
    token: admin, method: 'PUT', body: {
      availability_date: fixture.serviceDate, availability_status: 'available', start_time: '09:00', end_time: '17:00',
    },
  })).status, 200);
  assert.equal((await raw('/admin/bookings/' + next.id + '/assign', {
    token: admin, body: { technician_id: tech.id },
  })).status, 201);
  const assigned = await app.bookingService.getBookingById(next.id);
  assert.equal(assigned.status, 'assigned');
  assert.ok(assigned.assignedAt);
  assert.deepEqual(assigned.technician, { fullName: 'Assigned Technician', phone: '+919110000201' });
  const ownedResponse = await raw('/bookings/' + next.id, { token: sessionRecord(app).tokens.access_token });
  assert.equal(ownedResponse.status, 200);
  assert.deepEqual((await ownedResponse.json()).technician, {
    full_name: 'Assigned Technician', phone_number: '+919110000201',
  });
  assert.equal(await other.bookingService.getBookingById(next.id), undefined);
  assert.equal((await raw('/admin/bookings/' + next.id + '/unassign', {
    token: admin, body: { reason: 'Technician changed' },
  })).status, 200);
  assert.equal((await app.bookingService.getBookingById(next.id)).technician, null);
  await assert.rejects(app.bookingService.cancel(next.id), is(409));
  const manualBooking = await app.bookingService.createBooking({
    service_id: fixture.fixed, service_date: fixture.serviceDate, address: app.addressPayload(manual),
    pricing: {}, customer_instructions: null,
  }, randomUUID());
  assert.equal(manualBooking.estimatedAmount, '450.00');
  assert.equal(manualBooking.location.coordinates, null);

  const defaultService = services.items.find((item) => item.name === 'Solar Panel Cleaning');
  const optionalInput = { service_id: defaultService.id, pricing: {}, customer_instructions: null };
  const optionalKey = randomUUID();
  const pending = await app.bookingService.createBooking(optionalInput, optionalKey);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.serviceDate, null);
  assert.equal(pending.location, null);
  assert.equal(pending.coverageMatched, null);
  assert.equal((await app.bookingService.createBooking(optionalInput, optionalKey)).id, pending.id);
  assert.equal((await app.bookingService.getBookingById(pending.id)).location, null);
  const pendingCard = (await app.bookingService.list('pending', 1)).items.find((item) => item.id === pending.id);
  assert.equal(pendingCard.serviceDate, null);
  assert.equal(pendingCard.addressSummary, null);
  const dateOnly = await app.bookingService.createBooking({ ...optionalInput, service_date: fixture.serviceDate }, randomUUID());
  assert.equal(dateOnly.serviceDate, fixture.serviceDate);
  assert.equal(dateOnly.location, null);
  const addressOnly = await app.bookingService.createBooking({ ...optionalInput,
    address: { address_line: 'Near the post office', location_source: 'manual' },
  }, randomUUID());
  assert.equal(addressOnly.serviceDate, null);
  assert.equal(addressOnly.location.address.formattedAddress, 'Near the post office');
  const gpsOnly = await app.bookingService.createBooking({ ...optionalInput,
    address: { address_line: null, latitude: 9.93, longitude: 76.27, location_source: 'gps' },
  }, randomUUID());
  assert.deepEqual(gpsOnly.location.coordinates, { latitude: 9.93, longitude: 76.27 });

  app.transport.forceStatus = 503;
  await assert.rejects(app.catalogue.services(), is(503));
  app.transport.forceStatus = 429;
  await assert.rejects(app.catalogue.services(), (error) => error.status === 429 && error.retryAfter === 3);
  app.transport.forceStatus = undefined;
  app.transport.stall = true;
  await assert.rejects(app.catalogue.services(), (error) => error.code === 'timeout');
  app.transport.stall = false;
  app.transport.invalidResponse = true;
  await assert.rejects(app.catalogue.services(), (error) => error.code === 'invalid_response');
  app.transport.invalidResponse = false;
  const missingPhone = await raw('/customers/register', { body: { full_name: 'Missing phone' } });
  assert.equal(missingPhone.status, 422);
  assert.ok((await missingPhone.json()).error.details.some((issue) => issue.field === 'phone_number'));

  const family = await raw('/customers/auth/login', { body: { installation_credential: original.installation } });
  assert.equal(family.status, 200);
  const extraToken = (await family.json()).tokens.access_token;
  const endedToken = sessionRecord(app).tokens.access_token;
  await app.sessionService.logout(false);
  assert.equal((await raw('/customers/me', { token: endedToken })).status, 401);
  assert.equal((await raw('/customers/me', { token: extraToken })).status, 200);
  app = mobile(app.storage);
  assert.deepEqual(await app.sessionService.restore(), { knownInstallation: true });
  assert.equal(sessionRecord(app).tokens, undefined);
  await app.sessionService.signIn();
  await app.sessionService.logout(true);
  assert.equal((await raw('/customers/me', { token: extraToken })).status, 401);
});

