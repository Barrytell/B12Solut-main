// Reads a Base44 JSON export and checks it before anything is written.
// Pure functions (no database) so the checks are unit-tested.
//
// Rules: nothing is "repaired" silently. Every value that does not fit the new
// schema is reported as a problem; the import refuses while any problem remains.
// The only transformations are the documented defaults (S10: missing sale_type
// = retail; missing enum fields = the Base44 default) and each one is counted
// in the report.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { centsToString, milliToString, toCents, toMilli } from '../../src/lib/money.js';

export const ENTITIES = ['User', 'Category', 'Supplier', 'Product', 'Shift', 'Transaction', 'Return', 'StockAdjustment'];
const PLATFORM = ['id', 'created_date', 'updated_date', 'created_by_id'];

// Field lists from docs/schema/all-entities.json (+ built-in User fields).
const FIELDS = {
  User: ['email', 'full_name', 'display_name', 'role'],
  Category: ['name'],
  Supplier: ['name', 'contact_name', 'email', 'phone', 'address', 'notes', 'is_active'],
  Product: ['name', 'sku', 'barcode', 'category', 'selling_price', 'wholesale_price', 'cost_price', 'stock_quantity',
    'low_stock_threshold', 'tax_rate', 'is_active', 'image_url', 'supplier_id'],
  Shift: ['cashier_email', 'cashier_name', 'start_time', 'end_time', 'status', 'total_cash_sales', 'total_card_sales',
    'total_electronic_sales', 'total_revenue', 'total_transactions', 'total_cost', 'total_profit'],
  Transaction: ['transaction_number', 'sale_type', 'customer_name', 'cashier_email', 'cashier_name', 'items', 'subtotal',
    'tax_total', 'discount_amount', 'grand_total', 'total_cost', 'gross_profit', 'payment_method', 'amount_paid',
    'change_given', 'shift_id', 'status'],
  Return: ['return_number', 'original_transaction_number', 'cashier_email', 'cashier_name', 'items', 'total_refund',
    'total_cost_recovered', 'total_cost_lost', 'profit_impact', 'refund_method', 'reason', 'status'],
  StockAdjustment: ['product_id', 'product_name', 'sku', 'previous_quantity', 'new_quantity', 'delta', 'reason',
    'user_email', 'user_name'],
};
const ITEM_FIELDS = {
  Transaction: ['product_id', 'product_name', 'sku', 'quantity', 'unit_price', 'cost_price', 'tax_rate', 'tax_amount', 'line_total'],
  Return: ['product_id', 'product_name', 'sku', 'quantity', 'unit_price', 'cost_price', 'refund_amount', 'condition',
    'restocked', 'cost_recovered', 'cost_lost', 'profit_impact'],
};
const REQUIRED = {
  User: ['email'], Category: ['name'], Supplier: ['name'], Product: ['name', 'sku', 'selling_price'],
  Shift: ['cashier_email', 'start_time'], Transaction: ['transaction_number', 'cashier_email', 'grand_total', 'payment_method'],
  Return: ['return_number', 'cashier_email', 'total_refund', 'refund_method'],
  StockAdjustment: ['product_name', 'previous_quantity', 'new_quantity', 'reason', 'user_email'],
};
const MONEY = {
  Product: ['selling_price', 'wholesale_price', 'cost_price'],
  Shift: ['total_cash_sales', 'total_card_sales', 'total_electronic_sales', 'total_revenue', 'total_cost', 'total_profit'],
  Transaction: ['subtotal', 'tax_total', 'discount_amount', 'grand_total', 'total_cost', 'gross_profit', 'amount_paid', 'change_given'],
  Return: ['total_refund', 'total_cost_recovered', 'total_cost_lost', 'profit_impact'],
};
const ITEM_MONEY = {
  Transaction: ['unit_price', 'cost_price', 'tax_amount', 'line_total'],
  Return: ['unit_price', 'cost_price', 'refund_amount', 'cost_recovered', 'cost_lost', 'profit_impact'],
};
const QTY = { Product: ['stock_quantity', 'low_stock_threshold'], StockAdjustment: ['previous_quantity', 'new_quantity', 'delta'] };
const PERCENT = { Product: ['tax_rate'] };
const ENUMS = {
  User: { role: [['admin', 'user'], 'user'] },
  Shift: { status: [['open', 'closed'], 'open'] },
  Transaction: { sale_type: [['retail', 'wholesale'], 'retail'], payment_method: [['cash', 'card', 'electronic'], null], status: [['completed', 'refunded', 'voided'], 'completed'] },
  Return: { refund_method: [['cash', 'card', 'electronic', 'store_credit'], null], status: [['processed', 'voided'], 'processed'] },
};
const DEFAULTS = {
  Product: { wholesale_price: '0.00', cost_price: '0.00', stock_quantity: '0.000', low_stock_threshold: '10.000', tax_rate: '0.00', is_active: true },
  Supplier: { is_active: true },
};

/** Reads <Entity>.json (array, or {data|items|records: [...]}) from dir. Missing files mean "no rows". */
export function loadExport(dir) {
  const out = {};
  for (const entity of ENTITIES) {
    const file = [`${entity}.json`, `${entity.toLowerCase()}.json`, `${entity}s.json`].map((f) => join(dir, f)).find(existsSync);
    if (!file) { out[entity] = []; continue; }
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const rows = Array.isArray(parsed) ? parsed : parsed.data ?? parsed.items ?? parsed.records;
    if (!Array.isArray(rows)) throw new Error(`${file}: expected a JSON array of records`);
    out[entity] = rows;
  }
  return out;
}

/**
 * Validates and normalises the export. Returns { problems, notes, counts, plan }.
 * `plan` holds rows ready to insert (exact decimal strings) and is only usable when problems is empty.
 */
export function preflight(data, { ignoreKeys = [], nullMissingProductRefs = false } = {}) {
  const problems = [];
  const notes = {};
  const note = (key) => { notes[key] = (notes[key] ?? 0) + 1; };
  const problem = (entity, id, issue) => problems.push({ entity, id: id ?? '(no id)', issue });
  const ignore = new Set(ignoreKeys);
  const plan = {};

  const decimal = (entity, id, field, value, parse, format, { min } = {}) => {
    if (value === undefined || value === null || value === '') return undefined;
    try {
      const units = parse(value);
      if (min !== undefined && units < min) { problem(entity, id, `${field} is negative (${value})`); return undefined; }
      return format(units);
    } catch {
      problem(entity, id, `${field} has more decimals than the schema allows or is not a number (${JSON.stringify(value)})`);
      return undefined;
    }
  };

  for (const entity of ENTITIES) {
    const rows = data[entity] ?? [];
    const allowed = new Set([...PLATFORM, ...FIELDS[entity]]);
    const seen = new Set();
    plan[entity] = [];
    for (const raw of rows) {
      const id = raw?.id;
      if (!id || typeof id !== 'string') { problem(entity, id, 'missing or non-text id'); continue; }
      if (seen.has(id)) { problem(entity, id, 'duplicate id'); continue; }
      seen.add(id);

      const unknown = Object.keys(raw).filter((k) => !allowed.has(k) && !ignore.has(k));
      if (unknown.length) problem(entity, id, `unknown fields: ${unknown.join(', ')} (decide: map, drop with --ignore-keys, or stop)`);
      for (const f of REQUIRED[entity]) if (raw[f] === undefined || raw[f] === null || raw[f] === '') problem(entity, id, `missing required field ${f}`);

      const row = { id, created_date: raw.created_date ?? null, updated_date: raw.updated_date ?? null, created_by_id: raw.created_by_id ?? null };
      for (const f of FIELDS[entity]) if (f !== 'items') row[f] = raw[f] ?? null;

      for (const f of MONEY[entity] ?? []) {
        const v = decimal(entity, id, f, raw[f], toCents, centsToString, { min: ['profit_impact', 'gross_profit', 'total_profit'].includes(f) ? undefined : 0n });
        row[f] = v ?? (raw[f] == null ? null : row[f]);
      }
      for (const f of QTY[entity] ?? []) {
        const v = decimal(entity, id, f, raw[f], toMilli, milliToString, { min: f === 'delta' ? undefined : 0n });
        row[f] = v ?? (raw[f] == null ? null : row[f]);
      }
      for (const f of PERCENT[entity] ?? []) {
        const v = decimal(entity, id, f, raw[f], toCents, centsToString, { min: 0n });
        if (v !== undefined && toCents(v) > 10000n) problem(entity, id, `${f} above 100%`);
        row[f] = v ?? (raw[f] == null ? null : row[f]);
      }
      for (const [f, [values, def]] of Object.entries(ENUMS[entity] ?? {})) {
        if (row[f] == null || row[f] === '') {
          if (def === null) continue; // required, already reported
          row[f] = def;
          note(`${entity}.${f} missing -> default "${def}"${f === 'sale_type' ? ' (S10: older records have no sale_type)' : ''}`);
        } else if (!values.includes(row[f])) {
          problem(entity, id, `${f} "${row[f]}" is not one of ${values.join('|')}`);
        }
      }
      for (const [f, v] of Object.entries(DEFAULTS[entity] ?? {})) if (row[f] == null) row[f] = v;
      if (row.email) row.email = String(row.email).trim().toLowerCase();
      if (entity === 'Shift' && row.total_transactions != null && !Number.isInteger(row.total_transactions)) {
        problem(entity, id, 'total_transactions is not a whole number');
      }

      if (ITEM_FIELDS[entity]) {
        const items = raw.items ?? [];
        if (!Array.isArray(items)) { problem(entity, id, 'items is not a list'); row.items = []; } else {
          const itemAllowed = new Set(ITEM_FIELDS[entity]);
          row.items = items.map((it, i) => {
            const where = `${id} item ${i + 1}`;
            const unk = Object.keys(it ?? {}).filter((k) => !itemAllowed.has(k) && !ignore.has(k));
            if (unk.length) problem(entity, where, `unknown item fields: ${unk.join(', ')} (S9: import aborts rather than lose data)`);
            if (!it?.product_name) problem(entity, where, 'item has no product_name');
            const item = { line_no: i + 1 };
            for (const f of ITEM_FIELDS[entity]) item[f] = it?.[f] ?? null;
            for (const f of ITEM_MONEY[entity]) item[f] = decimal(entity, where, f, it?.[f], toCents, centsToString, { min: f === 'profit_impact' ? undefined : 0n }) ?? '0.00';
            item.quantity = decimal(entity, where, 'quantity', it?.quantity ?? 1, toMilli, milliToString, { min: 1n }) ?? '1.000';
            if (entity === 'Transaction') item.tax_rate = decimal(entity, where, 'tax_rate', it?.tax_rate ?? 0, toCents, centsToString, { min: 0n }) ?? '0.00';
            if (entity === 'Return') {
              item.condition = it?.condition ?? 'good';
              if (!['good', 'damaged'].includes(item.condition)) problem(entity, where, `condition "${item.condition}" is not good|damaged`);
              item.restocked = it?.restocked ?? item.condition === 'good';
            }
            return item;
          });
        }
      }
      plan[entity].push(row);
    }
  }

  // ---- cross-record checks -------------------------------------------------
  const byId = (entity) => new Map(plan[entity].map((r) => [r.id, r]));
  const users = new Set(plan.User.map((u) => u.email));
  const categories = new Set(plan.Category.map((c) => c.name));
  const suppliers = byId('Supplier');
  const products = byId('Product');
  const shifts = byId('Shift');

  const dup = (entity, field) => {
    const seen = new Map();
    for (const r of plan[entity]) {
      if (r[field] == null) continue;
      if (seen.has(r[field])) problem(entity, r.id, `duplicate ${field} "${r[field]}" (also ${seen.get(r[field])})`);
      else seen.set(r[field], r.id);
    }
  };
  dup('User', 'email'); dup('Category', 'name'); dup('Transaction', 'transaction_number'); dup('Return', 'return_number');

  const needUser = (entity, field) => {
    for (const r of plan[entity]) if (r[field] && !users.has(String(r[field]).toLowerCase())) problem(entity, r.id, `${field} ${r[field]} is not a user in the export`);
  };
  needUser('Shift', 'cashier_email'); needUser('Transaction', 'cashier_email'); needUser('Return', 'cashier_email'); needUser('StockAdjustment', 'user_email');
  for (const entity of ['Shift', 'Transaction', 'Return', 'StockAdjustment']) {
    const f = entity === 'StockAdjustment' ? 'user_email' : 'cashier_email';
    for (const r of plan[entity]) if (r[f]) r[f] = String(r[f]).toLowerCase();
  }

  for (const p of plan.Product) {
    if (p.category && !categories.has(p.category)) problem('Product', p.id, `category "${p.category}" is not in Category (create it, or clear the category)`);
    if (p.supplier_id && !suppliers.has(p.supplier_id)) problem('Product', p.id, `supplier_id ${p.supplier_id} does not exist`);
  }
  for (const t of plan.Transaction) if (t.shift_id && !shifts.has(t.shift_id)) problem('Transaction', t.id, `shift_id ${t.shift_id} does not exist`);
  const productRef = (entity, owner, item) => {
    if (!item.product_id || products.has(item.product_id)) return;
    if (nullMissingProductRefs) { item.product_id = null; note(`${entity} item product_id of a deleted product -> null (name/sku kept)`); } else {
      problem(entity, `${owner} item ${item.line_no}`, `product_id ${item.product_id} does not exist (deleted product?) — rerun with --null-missing-product-refs to keep the line without the link`);
    }
  };
  for (const t of plan.Transaction) for (const it of t.items) productRef('Transaction', t.id, it);
  for (const r of plan.Return) for (const it of r.items) productRef('Return', r.id, it);
  for (const a of plan.StockAdjustment) {
    if (a.product_id && !products.has(a.product_id)) { a.product_id = null; note('StockAdjustment for a deleted product -> product_id null (S8, audit kept)'); }
    if (a.previous_quantity == null || a.new_quantity == null) continue;
    const exact = toMilli(a.new_quantity) - toMilli(a.previous_quantity);
    if (a.delta == null) { a.delta = milliToString(exact); note('StockAdjustment.delta missing -> new - previous (exact)'); } else if (toMilli(a.delta) !== exact) {
      problem('StockAdjustment', a.id, `delta ${a.delta} != new_quantity - previous_quantity (${milliToString(exact)})`);
    }
  }
  for (const entity of ENTITIES) {
    for (const r of plan[entity]) if (!r.created_date) note(`${entity}.created_date missing -> import time`);
  }

  const open = new Map();
  for (const s of plan.Shift) if (s.status === 'open') open.set(s.cashier_email, (open.get(s.cashier_email) ?? 0) + 1);
  for (const [email, n] of open) if (n > 1) problem('Shift', email, `${n} open shifts for one cashier (S4 allows one; close the extra ones in Base44 first)`);

  // ---- totals must add up exactly -------------------------------------------
  // Values already reported as invalid are skipped here (no second, misleading report).
  const c = (v) => { if (v == null) return 0n; try { return toCents(v); } catch { return null; } };
  const all = (...vals) => vals.every((v) => v !== null);
  for (const t of plan.Transaction) {
    if (!t.items.length) continue;
    const parts = t.items.map((i) => c(i.line_total));
    if (!all(...parts)) continue;
    const lines = parts.reduce((s, v) => s + v, 0n);
    const [sub, tax, grand, disc] = [c(t.subtotal), c(t.tax_total), c(t.grand_total), c(t.discount_amount)];
    if (t.subtotal != null && t.tax_total != null && all(sub, tax) && sub + tax !== lines) {
      problem('Transaction', t.id, `subtotal + tax (${t.subtotal} + ${t.tax_total}) != sum of lines (${centsToString(lines)})`);
    }
    if (t.subtotal != null && t.tax_total != null && t.grand_total != null && all(sub, tax, grand, disc) && grand !== sub + tax - disc) {
      problem('Transaction', t.id, `grand_total ${t.grand_total} != subtotal + tax - discount`);
    }
  }
  for (const r of plan.Return) {
    if (!r.items.length) continue;
    for (const [total, item] of [['total_refund', 'refund_amount'], ['total_cost_recovered', 'cost_recovered'], ['total_cost_lost', 'cost_lost'], ['profit_impact', 'profit_impact']]) {
      const parts = r.items.map((i) => c(i[item]));
      const want = c(r[total]);
      if (r[total] == null || !all(want, ...parts)) continue;
      const sum = parts.reduce((s, v) => s + v, 0n);
      if (want !== sum) problem('Return', r.id, `${total} ${r[total]} != sum of lines ${centsToString(sum)}`);
    }
  }

  const counts = Object.fromEntries(ENTITIES.map((e) => [e, plan[e].length]));
  return { problems, notes, counts, plan };
}

/** Exact decimal totals of the plan, compared with the database after the import. */
export function planTotals(plan) {
  const sum = (rows, f) => centsToString(rows.reduce((s, r) => s + (r[f] == null ? 0n : toCents(r[f])), 0n));
  const sumQty = (rows, f) => milliToString(rows.reduce((s, r) => s + (r[f] == null ? 0n : toMilli(r[f])), 0n));
  return {
    transactions_grand_total: sum(plan.Transaction, 'grand_total'),
    transactions_total_cost: sum(plan.Transaction, 'total_cost'),
    transaction_lines: String(plan.Transaction.reduce((n, t) => n + t.items.length, 0)),
    returns_total_refund: sum(plan.Return, 'total_refund'),
    return_lines: String(plan.Return.reduce((n, r) => n + r.items.length, 0)),
    shifts_total_revenue: sum(plan.Shift, 'total_revenue'),
    products_stock: sumQty(plan.Product, 'stock_quantity'),
  };
}
