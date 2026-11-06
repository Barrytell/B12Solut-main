// Permission matrix, validation and injection guards through the real Express
// stack, with a stub database (no network). Database behaviour itself
// (locks, rollback, concurrency) is covered by the staging integration suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import pino from 'pino';
import { createApp } from '../../src/app.js';
import { makeRequireAuth } from '../../src/auth.js';
import { parseOrigins } from '../../src/config.js';
import { createMoney } from '../../src/lib/money.js';
import { createEntities } from '../../src/entities.js';
import { buildListQuery } from '../../src/routes/entities.js';
import { sniffImage } from '../../src/routes/uploads.js';
import { createDisabledAdvisor } from '../../src/routes/advisor.js';

const money = createMoney('USD');
const entities = createEntities(money);
const USERS = {
  admin: { id: 'u-admin', email: 'admin@x.test', full_name: 'Ann', display_name: 'Ann', role: 'admin' },
  cashier: { id: 'u-cash', email: 'cash@x.test', full_name: 'Cal', display_name: 'Cal', role: 'user' },
};

function build({ advisor = { status: async () => ({ enabled: true, reason: null }), chat: async () => ({}) } } = {}) {
  const queries = [];
  const db = {
    queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM app_users WHERE auth_user_id')) return { rows: USERS[params[0]] ? [USERS[params[0]]] : [], fields: [] };
      if (sql.includes('FROM public.shifts WHERE id')) {
        return { rows: [{ id: 's1', cashier_email: 'someone-else@x.test', status: 'closed', report_path: 'p.pdf' }], fields: [] };
      }
      return { rows: [], fields: [], rowCount: 0 };
    },
    async connect() { return { query: (s, p) => db.query(s, p), release() {} }; },
  };
  const uploaded = [];
  const storage = {
    uploaded,
    async upload(bucket, path, body, type) { uploaded.push({ bucket, path, type, size: body.length }); },
    async signedUrl() { return 'https://signed.example/x'; },
    publicUrl: (bucket, path) => `https://cdn.example/${bucket}/${path}`,
  };
  const config = {
    appEnv: 'staging', currency: 'USD', appUrl: 'https://app.example',
    isAllowedOrigin: parseOrigins('https://app.example', { allowWildcard: false }).isAllowed,
    storage: { productImages: 'product-images', shiftReports: 'shift-reports' },
  };
  const app = createApp({
    config, logger: pino({ level: 'silent' }), db,
    requireAuth: makeRequireAuth({ verifyToken: async (t) => (USERS[t] ? { sub: t } : null), db }),
    services: { money, entities, storage, sendMail: async () => {}, fmt: null, authAdmin: {}, advisor, notifyLowStock: async () => {} },
  });
  return { app, db, storage };
}

const as = (role) => ({ Authorization: `Bearer ${role}` });

test('cashier cannot write products, categories, suppliers or users (D6)', async () => {
  const { app } = build();
  for (const [method, path] of [
    ['post', '/api/entities/Product'], ['patch', '/api/entities/Product/p1'], ['delete', '/api/entities/Product/p1'],
    ['post', '/api/entities/Category'], ['patch', '/api/entities/User/u-cash'], ['post', '/api/entities/Supplier'],
  ]) {
    const res = await request(app)[method](path).set(as('cashier')).send({ name: 'x', role: 'admin' });
    assert.equal(res.status, 403, `${method} ${path}`);
  }
});

test('cashier cannot read suppliers or the stock audit log', async () => {
  const { app } = build();
  assert.equal((await request(app).get('/api/entities/Supplier').set(as('cashier'))).status, 403);
  assert.equal((await request(app).get('/api/entities/StockAdjustment').set(as('cashier'))).status, 403);
});

test('admin-only endpoints refuse cashiers: returns (D2), inventory, users, uploads, advisor', async () => {
  const { app } = build();
  for (const path of ['/api/returns', '/api/inventory/update', '/api/inventory/bulk-stock', '/api/users/invite',
    '/api/uploads/product-image', '/api/restock-advisor/chat']) {
    assert.equal((await request(app).post(path).set(as('cashier')).send({})).status, 403, path);
  }
});

test('every protected route needs a token', async () => {
  const { app } = build();
  for (const [m, p] of [['get', '/api/entities/Product'], ['post', '/api/sales'], ['post', '/api/shifts/start'],
    ['post', '/api/returns'], ['get', '/api/shifts/s1/report-url'], ['post', '/api/uploads/product-image']]) {
    assert.equal((await request(app)[m](p)).status, 401, `${m} ${p}`);
  }
});

test('activity records have no generic writes; unknown entities 404', async () => {
  const { app } = build();
  const tx = await request(app).post('/api/entities/Transaction').set(as('admin')).send({});
  assert.equal(tx.status, 405);
  assert.match(tx.body.error.message, /\/api\/sales/);
  assert.equal((await request(app).patch('/api/entities/StockAdjustment/x').set(as('admin')).send({})).status, 405);
  assert.equal((await request(app).get('/api/entities/Secrets').set(as('admin'))).status, 404);
});

test('admins cannot demote themselves', async () => {
  const { app } = build();
  const res = await request(app).patch('/api/entities/User/u-admin').set(as('admin')).send({ role: 'user' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CANNOT_DEMOTE_SELF');
});

test('unknown fields are rejected; platform fields are ignored', async () => {
  const { app, db } = build();
  const bad = await request(app).post('/api/entities/Category').set(as('admin')).send({ name: 'Tea', evil: true });
  assert.equal(bad.status, 400);
  db.queries.length = 0;
  await request(app).post('/api/entities/Category').set(as('admin')).send({ id: 'forced', created_by_id: 'x', name: 'Tea' });
  const insert = db.queries.find((q) => q.sql.startsWith('INSERT INTO public.categories'));
  assert.ok(insert && !insert.params.includes('forced'));
  assert.deepEqual(insert.params, ['Tea', 'u-admin']);
});

test('report links: another cashier gets 404, not the URL', async () => {
  const { app } = build();
  assert.equal((await request(app).get('/api/shifts/s1/report-url').set(as('cashier'))).status, 404);
  const admin = await request(app).get('/api/shifts/s1/report-url').set(as('admin'));
  assert.equal(admin.status, 200);
  assert.equal(admin.body.expires_in, 600);
});

test('list query: whitelist only, values parameterised, cashier scope forced', () => {
  const user = USERS.cashier;
  const q = buildListQuery(entities.Transaction, { sort: '-created_date', limit: '50', cashier_email: 'admin@x.test' }, user);
  assert.match(q.sql, /cashier_email = \$1 AND cashier_email = \$2/);
  assert.deepEqual(q.params.slice(0, 2), ['admin@x.test', 'cash@x.test']); // own scope always ANDed in
  assert.throws(() => buildListQuery(entities.Transaction, { sort: 'created_date;DROP TABLE x' }, user), /Cannot sort/);
  assert.throws(() => buildListQuery(entities.Transaction, { "1=1 OR status": 'x' }, user), /Unknown parameter/);
  assert.throws(() => buildListQuery(entities.Product, { is_active: 'yes' }, user), /true or false/);
  assert.throws(() => buildListQuery(entities.Product, { limit: '-1' }, user), /non-negative/);
  const capped = buildListQuery(entities.Shift, { limit: '999999' }, USERS.admin);
  assert.equal(capped.params.at(-2), 2000);
  const products = buildListQuery(entities.Product, {}, user);
  assert.match(products.sql, /is_active = \$1/);
  assert.equal(products.params[0], true);
});

test('without ANTHROPIC_API_KEY only the advisor is off; admins see "not configured"', async () => {
  const { app } = build({ advisor: createDisabledAdvisor() });
  const status = await request(app).get('/api/restock-advisor/status').set(as('admin'));
  assert.equal(status.status, 200);
  assert.deepEqual(status.body, { enabled: false, reason: 'not_configured' });
  const chat = await request(app).post('/api/restock-advisor/chat').set(as('admin')).send({ messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(chat.status, 503);
  assert.equal(chat.body.error.code, 'AI_NOT_CONFIGURED');
  assert.equal((await request(app).get('/api/restock-advisor/status').set(as('cashier'))).status, 403);
  // the rest of the API is unaffected
  assert.equal((await request(app).get('/api/auth/me').set(as('admin'))).status, 200);
  assert.equal((await request(app).get('/api/entities/Product').set(as('cashier'))).status, 200);
  assert.equal((await request(app).get('/health')).status, 200);
});

test('image upload: content sniffing, not names or headers (T17)', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  assert.equal(sniffImage(png).mime, 'image/png');
  assert.equal(sniffImage(Buffer.from('MZ\x90\x00 fake exe renamed to .png ....', 'latin1')), null);
  assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')), null);

  const { app, storage } = build();
  const ok = await request(app).post('/api/uploads/product-image').set(as('admin')).set('Content-Type', 'image/png').send(png);
  assert.equal(ok.status, 201);
  assert.match(ok.body.file_url, /^https:\/\/cdn\.example\/product-images\/[0-9a-f-]{36}\.png$/);
  assert.equal(storage.uploaded[0].type, 'image/png');
  const exe = await request(app).post('/api/uploads/product-image').set(as('admin')).set('Content-Type', 'image/png')
    .send(Buffer.from('MZ\x90\x00 not really an image at all....', 'latin1'));
  assert.equal(exe.status, 400);
  const big = await request(app).post('/api/uploads/product-image').set(as('admin')).set('Content-Type', 'image/png')
    .send(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]));
  assert.equal(big.status, 413);
});
