// POST /api/restock-advisor/chat (admin). Claude answers inventory questions
// with two READ-ONLY tools over the store's own data (design §3.9).
//
// Limitation (documented, not invented): the original Base44 `restock_advisor`
// agent's instructions and tools were not in the export. This prompt is written
// only from what the UI shows: "AI-powered inventory analysis & reorder
// suggestions" and its five suggested prompts. Answers will differ in wording.
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ApiError } from '../errors.js';

const SYSTEM = `You are the Restock Advisor for a retail and wholesale store's back office.
You help administrators decide what to reorder: products that are out of stock or at or below their low-stock threshold,
products below 50% of their threshold, the cost to restock, and groupings by category or supplier.
Always look at the real data with your tools before answering; never invent products, quantities or prices.
Restock cost = units needed x cost price. Unless the user says otherwise, "units needed" means bringing stock back up to
twice the low-stock threshold. Quote amounts in the store currency given below. Be concise and use short tables or lists.`;

const chatSchema = z.strictObject({
  messages: z.array(z.strictObject({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(4000),
  })).min(1).max(40).refine((m) => m[m.length - 1].role === 'user', 'The last message must be from the user'),
});

/** Used when ANTHROPIC_API_KEY is not set: only the advisor is off, nothing else changes. */
export function createDisabledAdvisor() {
  return {
    ready: Promise.resolve(false),
    status: async () => ({ enabled: false, reason: 'not_configured' }),
    chat: async () => {
      throw new ApiError(503, 'AI_NOT_CONFIGURED', 'The AI Restock Advisor has not been configured');
    },
  };
}

export function createAdvisor({ anthropic, model, db, currency, log }) {
  // Startup check (A11): the configured model must be available to this API key.
  const ready = anthropic.models.retrieve(model)
    .then(() => true)
    .catch((err) => {
      log.error({ model, status: err?.status }, 'ANTHROPIC_MODEL unavailable; restock advisor disabled');
      return false;
    });

  function makeTools(calls) {
    const track = (name, input, fn) => fn().then(
      (results) => { calls.push({ name, arguments_string: JSON.stringify(input), status: 'completed', results }); return results; },
      (err) => { calls.push({ name, arguments_string: JSON.stringify(input), status: 'failed', results: 'Tool failed' }); throw err; },
    );
    return [
      betaZodTool({
        name: 'get_inventory',
        description: 'All products with name, SKU, category, supplier, stock on hand, low-stock threshold, cost price, selling price and whether the product is active.',
        inputSchema: z.object({}),
        run: (input) => track('get_inventory', input, async () => {
          const { rows } = await db.query(
            `SELECT p.name, p.sku, p.category, s.name AS supplier, p.stock_quantity, p.low_stock_threshold,
                    p.cost_price, p.selling_price, p.is_active
               FROM public.products p LEFT JOIN public.suppliers s ON s.id = p.supplier_id ORDER BY p.name`,
          );
          return JSON.stringify(rows);
        }),
      }),
      betaZodTool({
        name: 'get_sales_velocity',
        description: 'Units sold per product over the last N days (completed sales only), to estimate demand.',
        inputSchema: z.object({ days: z.number().int().min(1).max(365).describe('Look-back window in days') }),
        run: (input) => track('get_sales_velocity', input, async () => {
          const { rows } = await db.query(
            `SELECT i.product_name, i.sku, SUM(i.quantity) AS units_sold
               FROM public.transaction_items i JOIN public.transactions t ON t.id = i.transaction_id
              WHERE t.status = 'completed' AND t.created_date >= now() - make_interval(days => $1)
              GROUP BY i.product_name, i.sku ORDER BY units_sold DESC`,
            [input.days],
          );
          return JSON.stringify(rows);
        }),
      }),
    ];
  }

  async function chat(messages) {
    if (!(await ready)) throw new ApiError(503, 'AI_MODEL_UNAVAILABLE', 'The restock advisor is not available right now');
    const calls = [];
    const final = await anthropic.beta.messages.toolRunner({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: `${SYSTEM}\nStore currency: ${currency}.`,
      tools: makeTools(calls),
      messages,
      max_iterations: 8,
    });
    if (final.stop_reason === 'refusal') {
      return { role: 'assistant', content: "I can't help with that request. Try asking about stock levels or reordering.", tool_calls: calls };
    }
    const text = final.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
    return { role: 'assistant', content: text || 'No answer was produced. Please try again.', tool_calls: calls };
  }

  const status = async () => ((await ready) ? { enabled: true, reason: null } : { enabled: false, reason: 'model_unavailable' });
  return { chat, ready, status };
}

export function advisorRouter({ advisor }) {
  const router = Router();
  router.use(rateLimit({
    windowMs: 60_000, limit: 20, keyGenerator: (req) => `advisor:${req.user.id}`,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many advisor requests, wait a minute' } }),
  }));
  // Lets the admin page show "not configured" instead of a failing chat box.
  router.get('/status', async (_req, res, next) => {
    try { res.json(await advisor.status()); } catch (e) { next(e); }
  });

  router.post('/chat', async (req, res, next) => {
    try {
      const { messages } = chatSchema.parse(req.body);
      res.json({ message: await advisor.chat(messages) });
    } catch (e) {
      if (e?.status && !(e instanceof ApiError) && e?.name !== 'ZodError') {
        req.log?.error({ status: e.status }, 'anthropic request failed');
        return next(new ApiError(502, 'AI_UPSTREAM_ERROR', 'The restock advisor could not answer, please try again'));
      }
      next(e);
    }
  });
  return router;
}
