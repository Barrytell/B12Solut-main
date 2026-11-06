// T16 official shift report from database values, T17 image uploads (staging).
// Report emails are captured in memory: nothing is sent.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createProduct, createUser, sale, setup, startShift } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
let ctx; let admin; let cashier; let other;

before(async () => {
  ctx = await setup('rep');
  admin = await createUser(ctx, 'admin');
  cashier = await createUser(ctx, 'user');
  other = await createUser(ctx, 'user');
});
after(() => cleanup(ctx));

test('T16: close -> server-built PDF stored privately -> admins emailed with database figures', async () => {
  const p = await createProduct(ctx, { name: 'report', stock: '50', price: '12.50', cost: '7.00' });
  const shift = await startShift(ctx, cashier.token);
  for (const method of ['cash', 'cash', 'card']) {
    const r = await ctx.api('post', '/api/sales', cashier.token).send(sale([{ product_id: p.id, quantity: 2 }], { payment_method: method, amount_paid: 100 }));
    assert.equal(r.status, 201);
  }
  assert.equal((await ctx.api('post', `/api/shifts/${shift.id}/report`, cashier.token).send({})).status, 409, 'report allowed on an open shift');

  const closed = await ctx.api('post', `/api/shifts/${shift.id}/close`, cashier.token).send({ declared_cash: '49.90' });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.shift.declared_cash, 49.9);
  assert.equal((await ctx.api('post', `/api/shifts/${shift.id}/close`, cashier.token).send({})).status, 409);

  const forged = await ctx.api('post', `/api/shifts/${shift.id}/report`, cashier.token).send({ total_revenue: 1 });
  assert.equal(forged.status, 400, 'financial fields accepted from the browser');
  assert.equal((await ctx.api('post', `/api/shifts/${shift.id}/report`, other.token).send({})).status, 404);

  ctx.mail.length = 0;
  const store = { storeName: '<script>alert(1)</script>', storeAddress: '1 Market St' };
  const rep = await ctx.api('post', `/api/shifts/${shift.id}/report`, cashier.token).send({ store });
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  ctx.storagePaths.push({ bucket: 'shift-reports', path: rep.body.report_path });
  assert.equal(rep.body.email_sent, true);
  assert.match(rep.body.report_path, new RegExp(`^${shift.id}/\\d+\\.pdf$`));

  const { data: file, error } = await ctx.supabase.storage.from('shift-reports').download(rep.body.report_path);
  assert.ifError(error);
  const pdf = Buffer.from(await file.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');

  const msg = ctx.mail.at(-1);
  assert.ok(msg.to.includes(admin.email), 'test admin not among recipients');
  assert.ok(!msg.to.includes(cashier.email), 'a cashier received the admin report');
  const fmt = ctx.services.fmt;
  assert.ok(msg.html.includes(fmt.money('75.00')), 'revenue (3 x 25.00) missing'); // from the database
  assert.ok(msg.html.includes(`-${fmt.money('0.10')} short`), 'variance 49.90 - 50.00 missing');
  assert.ok(!msg.html.includes('<script>alert(1)</script>'), 'store header not escaped');
  assert.equal(msg.attachments[0].filename, `shift-report-${shift.id}.pdf`);
  assert.equal(Buffer.compare(msg.attachments[0].content, pdf), 0);

  const row = (await ctx.db.query('SELECT report_path FROM public.shifts WHERE id = $1', [shift.id])).rows[0];
  assert.equal(row.report_path, rep.body.report_path);
});

test('T17: image upload accepts real images only, admin only', async () => {
  const ok = await ctx.api('post', '/api/uploads/product-image', admin.token).set('Content-Type', 'image/jpeg').send(JPEG);
  assert.equal(ok.status, 201);
  ctx.storagePaths.push({ bucket: 'product-images', path: ok.body.file_url.split('/product-images/')[1] });
  const fetched = await fetch(ok.body.file_url);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('content-type'), 'image/jpeg');

  const exe = Buffer.concat([Buffer.from('MZ\x90\x00', 'latin1'), Buffer.alloc(64)]);
  assert.equal((await ctx.api('post', '/api/uploads/product-image', admin.token).set('Content-Type', 'image/png').send(exe)).status, 400);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal((await ctx.api('post', '/api/uploads/product-image', admin.token).set('Content-Type', 'image/svg+xml').send(svg)).status, 400);
  const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
  assert.equal((await ctx.api('post', '/api/uploads/product-image', admin.token).set('Content-Type', 'image/png').send(big)).status, 413);
  assert.equal((await ctx.api('post', '/api/uploads/product-image', cashier.token).set('Content-Type', 'image/png').send(PNG)).status, 403);
});
