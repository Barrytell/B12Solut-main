// Admin inventory edits (design §3.6). Every row is locked, the previous
// quantity is read from the database (not the browser's copy), every stock
// change is audited, and all rows commit or none do.
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { withTransaction } from '../db.js';
import { milliToString, toMilli } from '../lib/money.js';
import { moneyField, qtyField } from '../lib/fields.js';
import { applyStockChange, lockProducts } from '../services/stock.js';

export function inventoryRouter({ db, money }) {
  const router = Router();

  const updateSchema = z.strictObject({
    reason: z.string().trim().max(500).optional(),
    updates: z.array(z.strictObject({
      product_id: z.string().min(1).max(100),
      stock_quantity: qtyField().optional(),
      selling_price: moneyField(money).optional(),
      wholesale_price: moneyField(money).optional(),
      cost_price: moneyField(money).optional(),
      low_stock_threshold: qtyField().optional(),
    })).min(1).max(500),
  });

  const bulkSchema = z.strictObject({
    product_ids: z.array(z.string().min(1).max(100)).min(1).max(5000),
    mode: z.enum(['set', 'add', 'subtract']),
    value: qtyField(),
    reason: z.string().trim().min(1, 'A reason is required for bulk stock changes').max(500),
  });

  router.post('/update', async (req, res, next) => {
    try {
      const body = updateSchema.parse(req.body);
      const ids = body.updates.map((u) => u.product_id);
      if (new Set(ids).size !== ids.length) throw new ApiError(400, 'DUPLICATE_ITEMS', 'Each product may appear only once');

      const count = await withTransaction(db, async (client) => {
        const products = await lockProducts(client, ids);
        const missing = ids.find((id) => !products.has(id));
        if (missing) throw new ApiError(404, 'NOT_FOUND', 'A product no longer exists', { product_id: missing });

        const stockChanges = body.updates.filter((u) => u.stock_quantity !== undefined
          && toMilli(u.stock_quantity) !== toMilli(products.get(u.product_id).stock_quantity));
        if (stockChanges.length && !body.reason) {
          throw new ApiError(400, 'REASON_REQUIRED', 'A reason is required when changing stock quantities');
        }

        for (const u of body.updates) {
          const cols = ['selling_price', 'wholesale_price', 'cost_price', 'low_stock_threshold'].filter((c) => u[c] !== undefined);
          if (cols.length) {
            await client.query(
              `UPDATE public.products SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
              [u.product_id, ...cols.map((c) => u[c])],
            );
          }
          if (u.stock_quantity !== undefined) {
            await applyStockChange(client, products.get(u.product_id), u.stock_quantity, { reason: body.reason, user: req.user });
          }
        }
        return body.updates.length;
      });
      res.json({ updated_count: count });
    } catch (e) { next(e); }
  });

  router.post('/bulk-stock', async (req, res, next) => {
    try {
      const body = bulkSchema.parse(req.body);
      const count = await withTransaction(db, async (client) => {
        const products = await lockProducts(client, body.product_ids);
        const value = toMilli(body.value);
        let changed = 0;
        for (const p of products.values()) {
          const prev = toMilli(p.stock_quantity);
          // add/subtract are clamped at 0, as in InventoryManager today
          const next = body.mode === 'set' ? value : body.mode === 'add' ? prev + value : (prev > value ? prev - value : 0n);
          const r = await applyStockChange(client, p, milliToString(next), { reason: body.reason, user: req.user });
          if (r.delta !== '0.000') changed++;
        }
        return { matched: products.size, changed };
      });
      res.json({ updated_count: count.matched, changed_count: count.changed });
    } catch (e) { next(e); }
  });

  return router;
}
