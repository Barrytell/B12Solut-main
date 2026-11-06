// POST /api/returns (admin only, D2): one transaction that records the return,
// restocks good items and audits every line (design §3.5, formulas from utils/returns.js).
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { withTransaction } from '../db.js';
import { centsToString, milliToString, toCents, toMilli } from '../lib/money.js';
import { moneyField, positiveQty } from '../lib/fields.js';
import { serializeOne, serializeResult } from '../lib/serialize.js';
import { applyStockChange, lockProducts, userName } from '../services/stock.js';
import { makeNumber } from './sales.js';

export function returnSchema(money) {
  return z.strictObject({
    items: z.array(z.strictObject({
      product_id: z.string().min(1).max(100),
      quantity: positiveQty(),
      unit_price: moneyField(money), // the refund price is the admin's decision (editable in ReturnItemRow)
      condition: z.enum(['good', 'damaged']),
    })).min(1).max(200),
    refund_method: z.enum(['cash', 'card', 'electronic', 'store_credit']),
    reason: z.string().trim().max(1000).optional(),
    original_transaction_number: z.string().trim().max(50).optional(),
  });
}

/** Pure return maths in integer cents (calcReturnItem / calcReturnTotals). */
export function priceReturn(money, lines, products) {
  const totals = { refund: 0n, recovered: 0n, lost: 0n, impact: 0n };
  const items = lines.map((line, i) => {
    const p = products.get(line.product_id);
    const qty = toMilli(line.quantity);
    const refund = money.lineAmount(toCents(line.unit_price), qty);
    const cost = money.lineAmount(toCents(p.cost_price), qty);
    const restocked = line.condition === 'good';
    const recovered = restocked ? cost : 0n;
    const lost = restocked ? 0n : cost;
    // good stock goes back on the shelf: only the profit is reversed; damaged: refund and cost are lost
    const impact = -(refund - recovered);
    totals.refund += refund; totals.recovered += recovered; totals.lost += lost; totals.impact += impact;
    return {
      line_no: i + 1, product_id: p.id, product_name: p.name, sku: p.sku, quantity: milliToString(qty),
      unit_price: line.unit_price, cost_price: p.cost_price, condition: line.condition, restocked,
      refund_amount: centsToString(refund), cost_recovered: centsToString(recovered),
      cost_lost: centsToString(lost), profit_impact: centsToString(impact),
    };
  });
  return {
    items,
    totals: {
      total_refund: centsToString(totals.refund), total_cost_recovered: centsToString(totals.recovered),
      total_cost_lost: centsToString(totals.lost), profit_impact: centsToString(totals.impact),
    },
  };
}

export function returnsRouter({ db, money }) {
  const router = Router();
  const schema = returnSchema(money);

  router.post('/', async (req, res, next) => {
    try {
      const body = schema.parse(req.body);
      const result = await withTransaction(db, async (client) => {
        const products = await lockProducts(client, body.items.map((i) => i.product_id));
        const missing = body.items.find((i) => !products.has(i.product_id));
        if (missing) throw new ApiError(409, 'PRODUCT_NOT_FOUND', 'A returned product no longer exists', { product_id: missing.product_id });

        const { items, totals } = priceReturn(money, body.items, products);
        const returnNumber = makeNumber('RT');
        const ret = (await client.query(
          `INSERT INTO public.returns (return_number, original_transaction_number, cashier_email, cashier_name,
             total_refund, total_cost_recovered, total_cost_lost, profit_impact, refund_method, reason, status, created_by_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'processed',$11) RETURNING id`,
          [returnNumber, body.original_transaction_number || null, req.user.email, userName(req.user),
            totals.total_refund, totals.total_cost_recovered, totals.total_cost_lost, totals.profit_impact,
            body.refund_method, body.reason || null, req.user.id],
        )).rows[0];

        let restocked = 0n;
        let writtenOff = 0n;
        for (const it of items) {
          await client.query(
            `INSERT INTO public.return_items (return_id, line_no, product_id, product_name, sku, quantity, unit_price, cost_price,
               refund_amount, condition, restocked, cost_recovered, cost_lost, profit_impact)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [ret.id, it.line_no, it.product_id, it.product_name, it.sku, it.quantity, it.unit_price, it.cost_price,
              it.refund_amount, it.condition, it.restocked, it.cost_recovered, it.cost_lost, it.profit_impact],
          );
          // products are re-read inside the lock so a product listed twice accumulates correctly
          const p = (await client.query('SELECT * FROM public.products WHERE id = $1', [it.product_id])).rows[0];
          const qty = toMilli(it.quantity);
          if (it.restocked) {
            restocked += qty;
            await applyStockChange(client, p, milliToString(toMilli(p.stock_quantity) + qty), {
              reason: `Customer return restocked (${returnNumber})`, user: req.user,
            });
          } else {
            writtenOff += qty;
            await applyStockChange(client, p, p.stock_quantity, {
              reason: `Customer return written off — damaged, not restocked (${returnNumber})`, user: req.user, alwaysLog: true,
            });
          }
        }
        return { id: ret.id, restocked, writtenOff };
      });

      const record = serializeOne(await db.query('SELECT * FROM public.returns WHERE id = $1', [result.id]));
      record.items = serializeResult(await db.query(
        `SELECT product_id, product_name, sku, quantity, unit_price, cost_price, refund_amount, condition, restocked,
                cost_recovered, cost_lost, profit_impact FROM public.return_items WHERE return_id = $1 ORDER BY line_no`,
        [result.id],
      ));
      res.status(201).json({
        return: record,
        restocked_units: Number(milliToString(result.restocked)),
        written_off_units: Number(milliToString(result.writtenOff)),
      });
    } catch (e) { next(e); }
  });

  return router;
}
