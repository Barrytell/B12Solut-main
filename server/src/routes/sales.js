// POST /api/sales: retail and wholesale checkout in ONE database transaction
// (design §3.4). Prices, costs and totals come from the database; the browser
// sends only product ids, quantities, the discount, the payment method and cash tendered.
import { Router } from 'express';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { withTransaction } from '../db.js';
import { centsToString, milliToString, toCents, toMilli } from '../lib/money.js';
import { moneyField, positiveQty } from '../lib/fields.js';
import { serializeOne, serializeResult } from '../lib/serialize.js';
import { lockProducts, userName } from '../services/stock.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeNumber = (prefix) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

export function saleSchema(money) {
  return z.strictObject({
    client_request_id: z.string().uuid(),
    sale_type: z.enum(['retail', 'wholesale']),
    items: z.array(z.strictObject({ product_id: z.string().min(1).max(100), quantity: positiveQty() })).min(1).max(200),
    discount_amount: moneyField(money).optional().default('0.00'),
    payment_method: z.enum(['cash', 'card', 'electronic']),
    amount_paid: moneyField(money).optional(),
    customer_name: z.string().trim().max(200).optional(),
  });
}

/** Pure pricing in integer cents; exported for unit tests. */
export function priceSale({ money, saleType, lines, products, discount, paymentMethod, amountPaid }) {
  const items = [];
  let subtotal = 0n;
  let taxTotal = 0n;
  let totalCost = 0n;
  lines.forEach((line, i) => {
    const p = products.get(line.product_id);
    const qty = toMilli(line.quantity);
    // wholesale uses wholesale_price when set (> 0), else the retail price (utils/wholesale.js)
    const unit = saleType === 'wholesale' && toCents(p.wholesale_price) > 0n ? toCents(p.wholesale_price) : toCents(p.selling_price);
    const cost = toCents(p.cost_price);
    const rate = toCents(p.tax_rate); // percent with 2 dp, i.e. basis points
    const base = money.lineAmount(unit, qty);
    const tax = money.lineTax(unit, qty, rate);
    const lineCost = money.lineAmount(cost, qty);
    subtotal += base;
    taxTotal += tax;
    totalCost += lineCost;
    items.push({
      line_no: i + 1, product_id: p.id, product_name: p.name, sku: p.sku,
      quantity: milliToString(qty), unit_price: centsToString(unit), cost_price: centsToString(cost),
      tax_rate: centsToString(rate), tax_amount: centsToString(tax), line_total: centsToString(base + tax),
    });
  });

  const disc = toCents(discount);
  if (disc > subtotal + taxTotal) throw new ApiError(400, 'DISCOUNT_TOO_LARGE', 'Discount cannot exceed the sale total');
  const grand = subtotal + taxTotal - disc;

  // Card and e-pay are charged the exact total; cash must cover it.
  let paid = grand;
  if (paymentMethod === 'cash') {
    if (amountPaid === undefined) throw new ApiError(400, 'AMOUNT_PAID_REQUIRED', 'Enter the cash received');
    paid = toCents(amountPaid);
    if (paid < grand) {
      throw new ApiError(409, 'PAYMENT_SHORT', 'Cash received is less than the total', { grand_total: Number(centsToString(grand)) });
    }
  }
  return {
    items,
    totals: {
      subtotal: centsToString(subtotal),
      tax_total: centsToString(taxTotal),
      discount_amount: centsToString(disc),
      grand_total: centsToString(grand),
      total_cost: centsToString(totalCost),
      gross_profit: centsToString(grand - totalCost),
      amount_paid: centsToString(paid),
      change_given: centsToString(paid - grand),
    },
  };
}

async function loadTransaction(db, id) {
  const tx = serializeOne(await db.query('SELECT * FROM public.transactions WHERE id = $1', [id]));
  const items = serializeResult(await db.query(
    'SELECT product_id, product_name, sku, quantity, unit_price, cost_price, tax_rate, tax_amount, line_total FROM public.transaction_items WHERE transaction_id = $1 ORDER BY line_no',
    [id],
  ));
  return { ...tx, items };
}

async function findReplay(db, requestId, user) {
  const { rows } = await db.query('SELECT id, cashier_email FROM public.transactions WHERE client_request_id = $1', [requestId]);
  if (!rows[0]) return null;
  if (rows[0].cashier_email !== user.email) throw new ApiError(409, 'REQUEST_ID_CONFLICT', 'This request id belongs to another sale');
  return loadTransaction(db, rows[0].id);
}

export function salesRouter({ db, money, notifyLowStock }) {
  const router = Router();
  const schema = saleSchema(money);

  router.post('/', async (req, res, next) => {
    try {
      const body = schema.parse(req.body);
      const ids = body.items.map((i) => i.product_id);
      if (new Set(ids).size !== ids.length) throw new ApiError(400, 'DUPLICATE_ITEMS', 'Each product may appear only once');

      const replay = await findReplay(db, body.client_request_id, req.user);
      if (replay) return res.status(200).json({ transaction: replay, low_stock_alerts: [], replayed: true });

      let outcome;
      try {
        outcome = await withTransaction(db, async (client) => {
          const shift = (await client.query(
            "SELECT * FROM public.shifts WHERE cashier_email = $1 AND status = 'open' FOR UPDATE",
            [req.user.email],
          )).rows[0];
          if (!shift) throw new ApiError(409, 'NO_OPEN_SHIFT', 'Start a shift before selling');

          const products = await lockProducts(client, ids);
          const short = [];
          for (const line of body.items) {
            const p = products.get(line.product_id);
            if (!p || !p.is_active) throw new ApiError(409, 'PRODUCT_UNAVAILABLE', 'A product in the cart is no longer available', { product_id: line.product_id });
            if (toMilli(line.quantity) > toMilli(p.stock_quantity)) short.push({ product_id: p.id, name: p.name, available: Number(p.stock_quantity) });
          }
          if (short.length) throw new ApiError(409, 'INSUFFICIENT_STOCK', 'Not enough stock for some items', short);

          const { items, totals } = priceSale({
            money, saleType: body.sale_type, lines: body.items, products,
            discount: body.discount_amount, paymentMethod: body.payment_method, amountPaid: body.amount_paid,
          });

          const tx = (await client.query(
            `INSERT INTO public.transactions
               (transaction_number, client_request_id, sale_type, customer_name, cashier_email, cashier_name,
                subtotal, tax_total, discount_amount, grand_total, total_cost, gross_profit,
                payment_method, amount_paid, change_given, shift_id, status, created_by_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'completed',$17)
             RETURNING id`,
            [makeNumber(body.sale_type === 'wholesale' ? 'WS' : 'TX'), body.client_request_id, body.sale_type,
              body.sale_type === 'wholesale' && body.customer_name ? body.customer_name : null,
              req.user.email, userName(req.user),
              totals.subtotal, totals.tax_total, totals.discount_amount, totals.grand_total, totals.total_cost,
              totals.gross_profit, body.payment_method, totals.amount_paid, totals.change_given, shift.id, req.user.id],
          )).rows[0];

          for (const it of items) {
            await client.query(
              `INSERT INTO public.transaction_items
                 (transaction_id, line_no, product_id, product_name, sku, quantity, unit_price, cost_price, tax_rate, tax_amount, line_total)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
              [tx.id, it.line_no, it.product_id, it.product_name, it.sku, it.quantity, it.unit_price, it.cost_price,
                it.tax_rate, it.tax_amount, it.line_total],
            );
            // relative decrement; CHECK (stock_quantity >= 0) is the backstop
            await client.query('UPDATE public.products SET stock_quantity = stock_quantity - $2 WHERE id = $1', [it.product_id, it.quantity]);
          }

          const methodColumn = { cash: 'total_cash_sales', card: 'total_card_sales', electronic: 'total_electronic_sales' }[body.payment_method];
          await client.query(
            `UPDATE public.shifts SET ${methodColumn} = ${methodColumn} + $2, total_revenue = total_revenue + $2,
                    total_transactions = total_transactions + 1, total_cost = total_cost + $3, total_profit = total_profit + $4
              WHERE id = $1`,
            [shift.id, totals.grand_total, totals.total_cost, totals.gross_profit],
          );

          // same rule as stockAlerts.js: was above the threshold, now at or below it
          const alerts = [];
          for (const it of items) {
            const p = products.get(it.product_id);
            const before = toMilli(p.stock_quantity);
            const after = before - toMilli(it.quantity);
            const threshold = toMilli(p.low_stock_threshold);
            if (before > threshold && after <= threshold) {
              alerts.push({ id: p.id, name: p.name, sku: p.sku, newQty: Number(milliToString(after)), threshold: Number(p.low_stock_threshold) });
            }
          }
          return { id: tx.id, alerts };
        });
      } catch (err) {
        // A concurrent duplicate of the same checkout lost the race on the unique key: replay it.
        if (err?.code === '23505' && err?.constraint === 'transactions_client_request_id_key') {
          const again = await findReplay(db, body.client_request_id, req.user);
          if (again) return res.status(200).json({ transaction: again, low_stock_alerts: [], replayed: true });
        }
        throw err;
      }

      const transaction = await loadTransaction(db, outcome.id);
      if (outcome.alerts.length) {
        // after commit, in the background: an email failure never fails the sale
        Promise.resolve(notifyLowStock(outcome.alerts)).catch((e) => req.log?.error({ err: e }, 'low stock email failed'));
      }
      res.status(201).json({ transaction, low_stock_alerts: outcome.alerts });
    } catch (e) { next(e); }
  });

  return router;
}
