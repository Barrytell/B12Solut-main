// Entity registry for the generic /api/entities routes: table, readable
// filters/sorts, limits, role scoping and write schemas (§3.1 of the design).
import { z } from 'zod';
import { moneyField, qtyField, percentField, optText, reqText, ref, urlField, optEmail } from './lib/fields.js';

const REFERENCE = { defaultLimit: 10000, maxLimit: 10000 };
const ACTIVITY = { defaultLimit: 500, maxLimit: 2000 };

export function createEntities(money) {
  const productFields = {
    name: reqText(200),
    sku: reqText(100),
    barcode: optText(100),
    category: optText(100),
    selling_price: moneyField(money),
    wholesale_price: moneyField(money).optional(),
    cost_price: moneyField(money).optional(),
    stock_quantity: qtyField().optional(),
    low_stock_threshold: qtyField().optional(),
    tax_rate: percentField().optional(),
    is_active: z.boolean().optional(),
    image_url: urlField(),
    supplier_id: ref(),
  };
  const supplierFields = {
    name: reqText(200),
    contact_name: optText(200),
    email: optEmail(),
    phone: optText(50),
    address: optText(500),
    notes: optText(2000),
    is_active: z.boolean().optional(),
  };

  return {
    User: {
      table: 'app_users', ...REFERENCE,
      filters: { role: 'text', email: 'text' }, sorts: ['created_date', 'email', 'display_name'],
      // cashiers see only themselves
      scope: (user) => (user.role === 'admin' ? null : { column: 'id', value: user.id }),
      writes: { update: z.strictObject({ display_name: optText(200), role: z.enum(['admin', 'user']).optional() }) },
    },
    Category: {
      table: 'categories', ...REFERENCE,
      filters: { name: 'text' }, sorts: ['name', 'created_date'],
      scope: () => null,
      writes: {
        create: z.strictObject({ name: reqText(100) }),
        update: z.strictObject({ name: reqText(100) }),
        delete: true,
      },
    },
    Supplier: {
      table: 'suppliers', ...REFERENCE,
      filters: { is_active: 'bool', name: 'text' }, sorts: ['created_date', 'name'],
      adminOnlyRead: true,
      scope: () => null,
      writes: {
        create: z.strictObject(supplierFields),
        update: z.strictObject(supplierFields).partial(),
        delete: true,
      },
    },
    Product: {
      table: 'products', ...REFERENCE,
      filters: { is_active: 'bool', category: 'text', supplier_id: 'text', sku: 'text', barcode: 'text' },
      sorts: ['created_date', 'name', 'stock_quantity'],
      scope: (user) => (user.role === 'admin' ? null : { column: 'is_active', value: true }),
      writes: {
        create: z.strictObject(productFields),
        update: z.strictObject(productFields).partial(),
        delete: true,
      },
    },
    Transaction: {
      table: 'transactions', ...ACTIVITY, items: 'transaction_items', itemsKey: 'transaction_id',
      filters: { sale_type: 'text', shift_id: 'text', cashier_email: 'text', status: 'text', transaction_number: 'text' },
      sorts: ['created_date'],
      scope: (user) => (user.role === 'admin' ? null : { column: 'cashier_email', value: user.email }),
      writes: {},
    },
    Return: {
      table: 'returns', ...ACTIVITY, items: 'return_items', itemsKey: 'return_id',
      filters: { cashier_email: 'text', status: 'text', original_transaction_number: 'text' },
      sorts: ['created_date'],
      scope: (user) => (user.role === 'admin' ? null : { column: 'cashier_email', value: user.email }),
      writes: {},
    },
    Shift: {
      table: 'shifts', ...ACTIVITY,
      filters: { status: 'text', cashier_email: 'text' }, sorts: ['created_date', 'start_time'],
      scope: (user) => (user.role === 'admin' ? null : { column: 'cashier_email', value: user.email }),
      writes: {},
    },
    StockAdjustment: {
      table: 'stock_adjustments', ...ACTIVITY,
      filters: { product_id: 'text', user_email: 'text' }, sorts: ['created_date'],
      adminOnlyRead: true,
      scope: () => null,
      writes: {},
    },
  };
}

/** Where to send writes that have their own atomic endpoint. */
export const DEDICATED = {
  Transaction: '/api/sales',
  Return: '/api/returns',
  Shift: '/api/shifts',
  StockAdjustment: 'the inventory endpoints (audit rows are written by the server)',
};
