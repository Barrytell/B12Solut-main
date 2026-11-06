// T3 Data API + Storage lockdown, T10 no self-registration (staging).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, createProduct, createUser, jwtPayload, setup, startShift, sweep } from './helpers.js';

const TABLES = ['app_users', 'categories', 'suppliers', 'products', 'shifts', 'transactions',
  'transaction_items', 'returns', 'return_items', 'stock_adjustments'];
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

let ctx; let admin; let cashier; let product; let imagePath; let reportShift;

before(async () => {
  ctx = await setup('lock');
  await sweep(ctx);
  admin = await createUser(ctx, 'admin');
  cashier = await createUser(ctx, 'user');
  product = await createProduct(ctx, { name: 'locked' });

  const up = await ctx.api('post', '/api/uploads/product-image', admin.token).set('Content-Type', 'image/png').send(PNG);
  assert.equal(up.status, 201, JSON.stringify(up.body));
  imagePath = up.body.file_url.split('/product-images/')[1];
  ctx.storagePaths.push({ bucket: 'product-images', path: imagePath });

  reportShift = await startShift(ctx, cashier.token);
  await ctx.api('post', `/api/shifts/${reportShift.id}/close`, cashier.token).send({});
  const rep = await ctx.api('post', `/api/shifts/${reportShift.id}/report`, cashier.token).send({});
  assert.equal(rep.status, 201, JSON.stringify(rep.body));
  reportShift.report_path = rep.body.report_path;
  ctx.storagePaths.push({ bucket: 'shift-reports', path: rep.body.report_path });
});
after(() => cleanup(ctx));

async function clients() {
  const signedIn = ctx.anon();
  const { error } = await signedIn.auth.signInWithPassword({ email: cashier.email, password: cashier.password });
  assert.ifError(error);
  const signedInAdmin = ctx.anon();
  await signedInAdmin.auth.signInWithPassword({ email: admin.email, password: admin.password });
  return { anonymous: ctx.anon(), cashier: signedIn, admin: signedInAdmin };
}

test('T3a: no table is readable or writable through the Data API', async () => {
  for (const [who, client] of Object.entries(await clients())) {
    for (const table of TABLES) {
      const read = await client.from(table).select('*').limit(5);
      assert.ok(read.error || read.data.length === 0, `${who} could read ${table}`);
      const ins = await client.from(table).insert({ id: `${ctx.P}x`, name: 'x' });
      assert.ok(ins.error, `${who} could insert into ${table}`);
    }
    const byId = await client.from('products').select('*').eq('id', product.id);
    assert.ok(byId.error || byId.data.length === 0, `${who} could read a known product`);
    const upd = await client.from('products').update({ stock_quantity: 999 }).eq('id', product.id).select();
    assert.ok(upd.error || upd.data.length === 0, `${who} could update a product`);
    const del = await client.from('products').delete().eq('id', product.id).select();
    assert.ok(del.error || del.data.length === 0, `${who} could delete a product`);
  }
  const still = (await ctx.db.query('SELECT stock_quantity FROM public.products WHERE id = $1', [product.id])).rows[0];
  assert.equal(still.stock_quantity, '10.000');
});

test('T3b: product images are publicly viewable but not writable by clients', async () => {
  const publicUrl = ctx.storage.publicUrl('product-images', imagePath);
  const res = await fetch(publicUrl);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');

  for (const [who, client] of Object.entries(await clients())) {
    const bucket = client.storage.from('product-images');
    assert.ok((await bucket.upload(`${ctx.P}${who}.png`, PNG, { contentType: 'image/png' })).error, `${who} could upload`);
    assert.ok((await bucket.update(imagePath, PNG, { contentType: 'image/png' })).error, `${who} could replace`);
    assert.ok((await bucket.move(imagePath, `${ctx.P}moved.png`)).error, `${who} could move`);
    const listed = await bucket.list('', { limit: 100 });
    assert.ok(listed.error || listed.data.length === 0, `${who} could list`);
    await bucket.remove([imagePath]); // silently ignored when RLS denies
  }
  assert.equal((await fetch(publicUrl)).status, 200, 'image was removed by a client');
});

test('T3c: shift reports are private; only the API issues 10-minute links', async () => {
  const path = reportShift.report_path;
  const publicUrl = ctx.storage.publicUrl('shift-reports', path);
  assert.notEqual((await fetch(publicUrl)).status, 200, 'report reachable by public URL');

  for (const [who, client] of Object.entries(await clients())) {
    const bucket = client.storage.from('shift-reports');
    assert.ok((await bucket.download(path)).error, `${who} could download`);
    assert.ok((await bucket.createSignedUrl(path, 600)).error, `${who} could sign a URL`);
    assert.ok((await bucket.upload(`${ctx.P}${who}.pdf`, Buffer.from('%PDF-1.4'), { contentType: 'application/pdf' })).error, `${who} could upload`);
    const listed = await bucket.list(reportShift.id);
    assert.ok(listed.error || listed.data.length === 0, `${who} could list`);
  }

  const owner = await ctx.api('get', `/api/shifts/${reportShift.id}/report-url`, cashier.token);
  assert.equal(owner.status, 200);
  const token = new URL(owner.body.url).searchParams.get('token');
  const { exp, iat } = jwtPayload(token);
  assert.equal(exp - iat, 600, 'signed link must expire after 10 minutes');
  const pdf = await fetch(owner.body.url);
  assert.equal(pdf.status, 200);
  assert.equal((await pdf.arrayBuffer()).byteLength > 1000, true);

  assert.equal((await ctx.api('get', `/api/shifts/${reportShift.id}/report-url`, admin.token)).status, 200);
  const other = await createUser(ctx, 'user');
  assert.equal((await ctx.api('get', `/api/shifts/${reportShift.id}/report-url`, other.token)).status, 404);
  assert.equal((await ctx.api('get', `/api/shifts/${reportShift.id}/report-url`)).status, 401);
});

test('T10: nobody can register themselves', async () => {
  const { data, error } = await ctx.anon().auth.signUp({ email: `${ctx.P}selfsignup@example.com`, password: 'Selfsignup-123456!' });
  assert.ok(error, 'sign-up was accepted');
  if (data?.user?.id) ctx.authUserIds.push(data.user.id);
  const row = await ctx.db.query('SELECT 1 FROM public.app_users WHERE email = $1', [`${ctx.P}selfsignup@example.com`]);
  assert.equal(row.rowCount, 0);
});
