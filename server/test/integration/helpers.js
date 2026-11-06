// Shared setup for the STAGING integration suite.
//
// - Refuses to run unless every setting points at the staging project in
//   scripts/targets.json (assertStagingTestTarget). Never production.
// - Runs the real Express app in-process against the real staging database,
//   Supabase Auth and Storage. Email is captured in memory (nothing is sent),
//   invitations use generateLink (no email), the AI advisor is stubbed
//   (07-advisor.test.js calls the real API only when RUN_AI_TESTS=1).
// - All data carries a unique run prefix and is deleted afterwards; sweep()
//   removes leftovers of crashed runs older than 24 h.
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import { assertStagingTestTarget, loadTargets } from '../../scripts/lib/target-guard.js';
import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';
import { createSupabaseAdmin, makeRequireAuth, makeVerifyToken } from '../../src/auth.js';
import { createApp } from '../../src/app.js';
import { createMoney } from '../../src/lib/money.js';
import { createFormat } from '../../src/lib/format.js';
import { createEntities } from '../../src/entities.js';
import { createStorage } from '../../src/storage.js';

export const EMAIL_DOMAIN = 'example.com';
export const PREFIX_ROOT = 't_';
const PASSWORD = () => `Tst-${randomBytes(12).toString('hex')}!`;

export async function setup(label) {
  assertStagingTestTarget(process.env, loadTargets()); // throws before any connection
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey?.startsWith('sb_publishable_')) throw new Error('SUPABASE_PUBLISHABLE_KEY (sb_publishable_...) is required for integration tests');

  const config = loadConfig(process.env);
  const P = `${PREFIX_ROOT}${label}_${Date.now().toString(36)}${randomBytes(2).toString('hex')}_`;
  const db = createPool(config.database);
  const supabase = createSupabaseAdmin(config.supabase);
  const money = createMoney(config.currency);
  const storage = createStorage(supabase);

  const mail = [];
  const lowStock = [];
  const inviteTokens = new Map();
  // Same interface the routes use, but no email is ever sent.
  const authAdmin = {
    async inviteUserByEmail(email, { redirectTo }) {
      const { data, error } = await supabase.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } });
      if (data?.properties?.hashed_token) inviteTokens.set(email, data.properties.hashed_token);
      return { data: data ? { user: data.user } : null, error };
    },
    deleteUser: (id) => supabase.auth.admin.deleteUser(id),
    getUserById: (id) => supabase.auth.admin.getUserById(id),
  };

  const services = {
    money,
    entities: createEntities(money),
    storage,
    sendMail: async (msg) => { mail.push(msg); },
    fmt: createFormat({ currency: config.currency, timeZone: config.timeZone }),
    authAdmin,
    advisor: { chat: async () => ({ role: 'assistant', content: 'stub', tool_calls: [] }) },
    notifyLowStock: async (alerts) => { lowStock.push(alerts); },
  };
  const requireAuth = makeRequireAuth({ verifyToken: makeVerifyToken(supabase), db });
  const app = createApp({ config, logger: pino({ level: process.env.TEST_LOG_LEVEL || 'silent' }), db, requireAuth, services });

  const anon = () => createClient(config.supabase.url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const ctx = {
    P, config, db, supabase, money, storage, services, app, mail, lowStock, inviteTokens, anon,
    authUserIds: [], emails: [], storagePaths: [],
    api: (method, path, token) => {
      const r = request(app)[method](path);
      return token ? r.set('Authorization', `Bearer ${token}`) : r;
    },
  };
  return ctx;
}

/** Creates a confirmed Supabase Auth user (no email sent) and optionally its app_users row. */
export async function createUser(ctx, role, { name, invited = true } = {}) {
  const email = `${ctx.P}${role}${ctx.emails.length}@${EMAIL_DOMAIN}`.toLowerCase();
  const password = PASSWORD();
  const { data, error } = await ctx.supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  ctx.authUserIds.push(data.user.id);
  ctx.emails.push(email);
  let appUser = null;
  if (invited) {
    appUser = (await ctx.db.query(
      `INSERT INTO public.app_users (email, full_name, display_name, role, auth_user_id)
       VALUES ($1, $2, $2, $3, $4) RETURNING id`,
      [email, name ?? `${ctx.P}${role}`, role === 'admin' ? 'admin' : 'user', data.user.id],
    )).rows[0];
  }
  const token = await signIn(ctx, email, password);
  return { id: appUser?.id, authId: data.user.id, email, password, token };
}

export async function signIn(ctx, email, password) {
  const { data, error } = await ctx.anon().auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return data.session.access_token;
}

export async function createProduct(ctx, { name = 'item', stock = '10', price = '2.50', cost = '1.00', tax = '0', wholesale = '0', threshold = '5' } = {}) {
  return (await ctx.db.query(
    `INSERT INTO public.products (name, sku, selling_price, wholesale_price, cost_price, stock_quantity, tax_rate, low_stock_threshold)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [`${ctx.P}${name}`, `${ctx.P}${name}`.slice(0, 100), price, wholesale, cost, stock, tax, threshold],
  )).rows[0];
}

export const productRow = async (ctx, id) => (await ctx.db.query('SELECT * FROM public.products WHERE id = $1', [id])).rows[0];
export const uuid = () => crypto.randomUUID();

export async function startShift(ctx, token) {
  const res = await ctx.api('post', '/api/shifts/start', token).send({});
  if (res.status !== 201) throw new Error(`start shift: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.shift;
}

/** Deletes everything this run created (FK-safe order). Safe to call twice. */
export async function cleanup(ctx) {
  if (!ctx) return; // setup was refused (not staging): nothing was created
  const like = `${ctx.P.replace(/_/g, '\\_')}%`;
  await deleteByPattern(ctx.db, like);
  if (ctx.storagePaths.length) {
    const byBucket = Object.groupBy(ctx.storagePaths, (p) => p.bucket);
    for (const [bucket, items] of Object.entries(byBucket)) {
      await ctx.supabase.storage.from(bucket).remove(items.map((i) => i.path)).catch(() => {});
    }
  }
  for (const id of ctx.authUserIds) await ctx.supabase.auth.admin.deleteUser(id).catch(() => {});
  await ctx.db.end().catch(() => {});
}

async function deleteByPattern(db, like, olderThan = null) {
  const age = olderThan ? ` AND created_date < now() - interval '${olderThan}'` : '';
  const emails = `SELECT email FROM public.app_users WHERE email LIKE $1${age}`;
  // report PDFs of test shifts are removed with the shift rows' paths by the caller
  await db.query(`DELETE FROM public.transactions WHERE cashier_email IN (${emails})`, [like]);
  await db.query(`DELETE FROM public.returns WHERE cashier_email IN (${emails})`, [like]);
  await db.query(`DELETE FROM public.stock_adjustments WHERE user_email IN (${emails}) OR product_name LIKE $1`, [like]);
  await db.query(`DELETE FROM public.shifts WHERE cashier_email IN (${emails})`, [like]);
  await db.query(`DELETE FROM public.transaction_items WHERE product_name LIKE $1`, [like]);
  await db.query(`DELETE FROM public.products WHERE name LIKE $1${age}`, [like]);
  await db.query(`DELETE FROM public.categories WHERE name LIKE $1${age}`, [like]);
  await db.query(`DELETE FROM public.suppliers WHERE (name LIKE $1 OR id LIKE $1)${age}`, [like]);
  await db.query(`DELETE FROM public.app_users WHERE email LIKE $1${age}`, [like]);
}

/** Removes leftovers from crashed runs (any test prefix, older than 24 h). */
export async function sweep(ctx) {
  await deleteByPattern(ctx.db, `${PREFIX_ROOT.replace(/_/g, '\\_')}%`, '24 hours');
  for (let page = 1; page < 50; page++) {
    const { data } = await ctx.supabase.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email?.startsWith(PREFIX_ROOT) && u.email.endsWith(`@${EMAIL_DOMAIN}`) && Date.now() - new Date(u.created_at) > 86_400_000) {
        await ctx.supabase.auth.admin.deleteUser(u.id).catch(() => {});
      }
    }
    if (users.length < 200) break;
  }
}

/** The payload of a JWT, for checking signed-URL lifetimes. */
export function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

export const sale = (items, extra = {}) => ({
  client_request_id: uuid(), sale_type: 'retail', payment_method: 'card', items, ...extra,
});
