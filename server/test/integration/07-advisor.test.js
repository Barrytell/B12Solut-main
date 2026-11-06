// T18 Restock Advisor against the real Anthropic API. Costs a few cents per
// run, so it runs only with RUN_AI_TESTS=1 (once per release, not per commit).
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import pino from 'pino';
import { createAdvisor } from '../../src/routes/advisor.js';
import { cleanup, createProduct, createUser, setup } from './helpers.js';

const enabled = process.env.RUN_AI_TESTS === '1';
let ctx; let admin; let cashier;

before(async () => {
  if (!enabled) return;
  ctx = await setup('ai');
  admin = await createUser(ctx, 'admin');
  cashier = await createUser(ctx, 'user');
  await createProduct(ctx, { name: 'emptyshelf', stock: '0', threshold: '10', cost: '2.00' });
  ctx.services.advisor = createAdvisor({
    anthropic: new Anthropic({ apiKey: ctx.config.anthropic.apiKey }),
    model: ctx.config.anthropic.model, db: ctx.db, currency: ctx.config.currency, log: pino({ level: 'silent' }),
  });
});
after(async () => { if (ctx) await cleanup(ctx); });

test('T18: configured model is available and answers from real inventory data', { skip: !enabled && 'set RUN_AI_TESTS=1', timeout: 300_000 }, async () => {
  assert.equal(await ctx.services.advisor.ready, true, `model ${ctx.config.anthropic.model} is not available to this API key`);
  const message = await ctx.services.advisor.chat([{ role: 'user', content: 'Which products are completely out of stock? List their names exactly.' }]);
  assert.ok(message.tool_calls.some((c) => c.name === 'get_inventory' && c.status === 'completed'), 'inventory tool not used');
  assert.ok(message.content.includes(`${ctx.P}emptyshelf`), 'answer does not mention the out-of-stock test product');
});

test('T18: a model the key cannot use disables only the advisor (503)', { skip: !enabled && 'set RUN_AI_TESTS=1', timeout: 120_000 }, async () => {
  const broken = createAdvisor({
    anthropic: new Anthropic({ apiKey: ctx.config.anthropic.apiKey }),
    model: 'claude-model-that-does-not-exist', db: ctx.db, currency: 'USD', log: pino({ level: 'silent' }),
  });
  await assert.rejects(broken.chat([{ role: 'user', content: 'hi' }]), (e) => e.status === 503 && e.code === 'AI_MODEL_UNAVAILABLE');
  assert.equal((await ctx.api('get', '/api/auth/me', admin.token)).status, 200, 'rest of the API affected');
});

test('T18: cashiers cannot use the advisor', { skip: !enabled && 'set RUN_AI_TESTS=1' }, async () => {
  assert.equal((await ctx.api('post', '/api/restock-advisor/chat', cashier.token).send({ messages: [{ role: 'user', content: 'hi' }] })).status, 403);
});
