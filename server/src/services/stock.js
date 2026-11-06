// Every stock change goes through here so it is always audited (D3).
// Callers must hold the product row lock (SELECT ... FOR UPDATE) in `client`'s transaction.
import { milliToString, toMilli } from '../lib/money.js';

export const userName = (u) => u.display_name || u.full_name || u.email;

/**
 * Sets stock to newQty (decimal string) and writes the audit row.
 * Returns { previous, next, delta } as decimal strings; no-op audit is skipped
 * unless `alwaysLog` (returns log written-off items with delta 0).
 */
export async function applyStockChange(client, product, newQty, { reason, user, alwaysLog = false }) {
  const prev = toMilli(product.stock_quantity);
  const next = toMilli(newQty);
  const delta = next - prev;
  if (delta !== 0n) {
    await client.query('UPDATE public.products SET stock_quantity = $2 WHERE id = $1', [product.id, milliToString(next)]);
  }
  if (delta !== 0n || alwaysLog) {
    await client.query(
      `INSERT INTO public.stock_adjustments
         (product_id, product_name, sku, previous_quantity, new_quantity, delta, reason, user_email, user_name, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [product.id, product.name, product.sku, milliToString(prev), milliToString(next), milliToString(delta),
        reason, user.email, userName(user), user.id],
    );
  }
  return { previous: milliToString(prev), next: milliToString(next), delta: milliToString(delta) };
}

/** Locks products in id order (deadlock-free) and returns a Map id -> row. */
export async function lockProducts(client, ids) {
  const unique = [...new Set(ids)].sort();
  const { rows } = await client.query(
    'SELECT * FROM public.products WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE',
    [unique],
  );
  return new Map(rows.map((r) => [r.id, r]));
}
