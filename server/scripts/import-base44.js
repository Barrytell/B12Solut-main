// Imports a Base44 JSON export (docs/migration/PHASE2-DESIGN.md §6).
//
//   node scripts/import-base44.js --dir=../exports --target=staging --expect-ref=<id> [--commit]
//        [--ignore-keys=a,b] [--null-missing-product-refs]
//
// 1. Guard: the target must be the selected project (production needs its own approval flag + typed ID).
// 2. Preflight: every problem is listed; nothing is repaired silently. Any problem -> stop.
// 3. Read-only conflict check: ids / emails / numbers already in the database -> stop.
// 4. Dry-run (default) stops here. With --commit: ONE transaction, FK order, original ids and dates.
// 5. Reconciliation inside the transaction: counts and exact decimal totals must equal the export,
//    otherwise everything rolls back.
// A JSON report is written to scripts/logs/ (git-ignored: it can contain personal data).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { guardOrExit, parseFlags } from './lib/target-guard.js';
import { loadExport, planTotals, preflight } from './lib/base44-export.js';
import { connect } from './lib/db.js';

const INSERT = {
  User: ['app_users', ['id', 'email', 'full_name', 'display_name', 'role', 'created_date', 'updated_date', 'created_by_id']],
  Category: ['categories', ['id', 'name', 'created_date', 'updated_date', 'created_by_id']],
  Supplier: ['suppliers', ['id', 'name', 'contact_name', 'email', 'phone', 'address', 'notes', 'is_active', 'created_date', 'updated_date', 'created_by_id']],
  Product: ['products', ['id', 'name', 'sku', 'barcode', 'category', 'selling_price', 'wholesale_price', 'cost_price', 'stock_quantity',
    'low_stock_threshold', 'tax_rate', 'is_active', 'image_url', 'supplier_id', 'created_date', 'updated_date', 'created_by_id']],
  Shift: ['shifts', ['id', 'cashier_email', 'cashier_name', 'start_time', 'end_time', 'status', 'total_cash_sales', 'total_card_sales',
    'total_electronic_sales', 'total_revenue', 'total_transactions', 'total_cost', 'total_profit', 'created_date', 'updated_date', 'created_by_id']],
  Transaction: ['transactions', ['id', 'transaction_number', 'sale_type', 'customer_name', 'cashier_email', 'cashier_name', 'subtotal', 'tax_total',
    'discount_amount', 'grand_total', 'total_cost', 'gross_profit', 'payment_method', 'amount_paid', 'change_given', 'shift_id', 'status',
    'created_date', 'updated_date', 'created_by_id']],
  Return: ['returns', ['id', 'return_number', 'original_transaction_number', 'cashier_email', 'cashier_name', 'total_refund', 'total_cost_recovered',
    'total_cost_lost', 'profit_impact', 'refund_method', 'reason', 'status', 'created_date', 'updated_date', 'created_by_id']],
  StockAdjustment: ['stock_adjustments', ['id', 'product_id', 'product_name', 'sku', 'previous_quantity', 'new_quantity', 'delta', 'reason',
    'user_email', 'user_name', 'created_date', 'updated_date', 'created_by_id']],
};
const ITEMS = {
  Transaction: ['transaction_items', 'transaction_id', ['line_no', 'product_id', 'product_name', 'sku', 'quantity', 'unit_price', 'cost_price', 'tax_rate', 'tax_amount', 'line_total']],
  Return: ['return_items', 'return_id', ['line_no', 'product_id', 'product_name', 'sku', 'quantity', 'unit_price', 'cost_price', 'refund_amount', 'condition', 'restocked', 'cost_recovered', 'cost_lost', 'profit_impact']],
};
// NOT NULL money/qty columns that Base44 may have left empty -> the column default (0)
const COALESCE_ZERO = new Set(['subtotal', 'tax_total', 'discount_amount', 'total_cost', 'gross_profit', 'amount_paid', 'change_given',
  'total_cash_sales', 'total_card_sales', 'total_electronic_sales', 'total_revenue', 'total_transactions', 'total_profit',
  'total_cost_recovered', 'total_cost_lost', 'profit_impact']);

export async function insertPlan(db, plan) {
  for (const [entity, [table, cols]] of Object.entries(INSERT)) {
    for (const row of plan[entity]) {
      const values = cols.map((c) => {
        if (c === 'created_date' || c === 'updated_date') return row[c] ?? new Date().toISOString();
        if (row[c] == null && COALESCE_ZERO.has(c)) return 0;
        return row[c];
      });
      await db.query(`INSERT INTO public.${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, values);
      if (ITEMS[entity]) {
        const [itemTable, fk, itemCols] = ITEMS[entity];
        for (const it of row.items) {
          await db.query(
            `INSERT INTO public.${itemTable} (${fk}, ${itemCols.join(', ')}) VALUES ($1, ${itemCols.map((_, i) => `$${i + 2}`).join(', ')})`,
            [row.id, ...itemCols.map((c) => it[c])],
          );
        }
      }
    }
  }
}

/** Database-side totals for exactly the imported ids, as exact decimal text. */
export async function databaseTotals(db, plan) {
  const ids = (e) => plan[e].map((r) => r.id);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0].v;
  return {
    transactions_grand_total: await one('SELECT COALESCE(SUM(grand_total), 0)::numeric(14,2)::text AS v FROM public.transactions WHERE id = ANY($1)', [ids('Transaction')]),
    transactions_total_cost: await one('SELECT COALESCE(SUM(total_cost), 0)::numeric(14,2)::text AS v FROM public.transactions WHERE id = ANY($1)', [ids('Transaction')]),
    transaction_lines: await one('SELECT count(*)::text AS v FROM public.transaction_items WHERE transaction_id = ANY($1)', [ids('Transaction')]),
    returns_total_refund: await one('SELECT COALESCE(SUM(total_refund), 0)::numeric(14,2)::text AS v FROM public.returns WHERE id = ANY($1)', [ids('Return')]),
    return_lines: await one('SELECT count(*)::text AS v FROM public.return_items WHERE return_id = ANY($1)', [ids('Return')]),
    shifts_total_revenue: await one('SELECT COALESCE(SUM(total_revenue), 0)::numeric(14,2)::text AS v FROM public.shifts WHERE id = ANY($1)', [ids('Shift')]),
    products_stock: await one('SELECT COALESCE(SUM(stock_quantity), 0)::numeric(15,3)::text AS v FROM public.products WHERE id = ANY($1)', [ids('Product')]),
  };
}

export async function databaseCounts(db, plan) {
  const out = {};
  for (const [entity, [table]] of Object.entries(INSERT)) {
    out[entity] = (await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE id = ANY($1)`, [plan[entity].map((r) => r.id)])).rows[0].n;
  }
  return out;
}

/** Rows that would collide with data already in the target database. */
export async function conflicts(db, plan) {
  const found = [];
  for (const [entity, [table]] of Object.entries(INSERT)) {
    const { rows } = await db.query(`SELECT id FROM public.${table} WHERE id = ANY($1) LIMIT 20`, [plan[entity].map((r) => r.id)]);
    for (const r of rows) found.push(`${entity} ${r.id} already exists`);
  }
  const unique = [
    ['app_users', 'email', plan.User.map((u) => u.email)],
    ['categories', 'name', plan.Category.map((c) => c.name)],
    ['transactions', 'transaction_number', plan.Transaction.map((t) => t.transaction_number)],
    ['returns', 'return_number', plan.Return.map((r) => r.return_number)],
  ];
  for (const [table, col, values] of unique) {
    const { rows } = await db.query(`SELECT ${col} AS v FROM public.${table} WHERE ${col} = ANY($1) LIMIT 20`, [values]);
    for (const r of rows) found.push(`${table}.${col} "${r.v}" already exists`);
  }
  const open = await db.query("SELECT cashier_email FROM public.shifts WHERE status = 'open' AND cashier_email = ANY($1)",
    [plan.Shift.filter((s) => s.status === 'open').map((s) => s.cashier_email)]);
  for (const r of open.rows) found.push(`${r.cashier_email} already has an open shift in the database`);
  return found;
}

/** Full import in one transaction; throws (and rolls back) if reconciliation fails. */
export async function importPlan(db, plan) {
  const expectedCounts = Object.fromEntries(Object.keys(INSERT).map((e) => [e, plan[e].length]));
  const expectedTotals = planTotals(plan);
  await db.query('BEGIN');
  try {
    await db.query("SET LOCAL b12.preserve_updated_date = 'on'"); // keep Base44's updated_date
    await insertPlan(db, plan);
    const counts = await databaseCounts(db, plan);
    const totals = await databaseTotals(db, plan);
    const mismatches = [
      ...Object.keys(expectedCounts).filter((k) => counts[k] !== expectedCounts[k]).map((k) => `${k}: export ${expectedCounts[k]} vs db ${counts[k]}`),
      ...Object.keys(expectedTotals).filter((k) => totals[k] !== expectedTotals[k]).map((k) => `${k}: export ${expectedTotals[k]} vs db ${totals[k]}`),
    ];
    if (mismatches.length) throw new Error(`reconciliation failed, nothing imported:\n  ${mismatches.join('\n  ')}`);
    await db.query('COMMIT');
    return { counts, totals };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

function writeReport(name, report) {
  const dir = join(import.meta.dirname, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { target, ref, commit } = await guardOrExit();
  const flags = parseFlags(process.argv.slice(2));
  if (typeof flags.dir !== 'string') { console.error('--dir=<folder with the Base44 JSON export> is required'); process.exit(1); }

  const data = loadExport(resolve(flags.dir));
  const result = preflight(data, {
    ignoreKeys: typeof flags['ignore-keys'] === 'string' ? flags['ignore-keys'].split(',') : [],
    nullMissingProductRefs: flags['null-missing-product-refs'] === true,
  });
  const report = { target, ref, mode: commit ? 'commit' : 'dry-run', counts: result.counts, notes: result.notes, problems: result.problems };
  if (!result.problems.length) report.totals = planTotals(result.plan); // only meaningful once every value parsed

  console.log(`[import] records: ${Object.entries(result.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  for (const [k, n] of Object.entries(result.notes)) console.log(`[import] note: ${k} (x${n})`);
  if (result.problems.length) {
    console.error(`[import] ${result.problems.length} problem(s). Nothing was written. First 50:`);
    for (const p of result.problems.slice(0, 50)) console.error(`  - ${p.entity} ${p.id}: ${p.issue}`);
    console.error(`[import] full report: ${writeReport('import-preflight', report)}`);
    process.exit(1);
  }

  const db = await connect();
  try {
    report.conflicts = await conflicts(db, result.plan);
    if (report.conflicts.length) {
      console.error(`[import] target database already holds ${report.conflicts.length} conflicting record(s). Nothing was written.`);
      for (const c of report.conflicts.slice(0, 50)) console.error(`  - ${c}`);
      console.error(`[import] report: ${writeReport('import-conflicts', report)}`);
      process.exit(1);
    }
    if (!commit) {
      console.log(`[import] dry-run OK: no problems, no conflicts. Re-run with --commit to import. Report: ${writeReport('import-dry-run', report)}`);
      process.exit(0);
    }
    report.result = await importPlan(db, result.plan);
    console.log(`[import] imported and reconciled: ${JSON.stringify(report.result.totals)}`);
    console.log(`[import] report: ${writeReport('import-commit', report)}`);
  } finally {
    await db.end();
  }
}
