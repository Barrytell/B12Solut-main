-- ============================================================================
-- B12 Store Solution — full database schema (PostgreSQL 13+)
-- Mirrors the Base44 entities in base44/entities/*.jsonc
--
-- Run:  psql -d store_solution -f docs/schema/schema.sql
--
-- Notes
--  * Every table carries the four platform columns: id, created_date,
--    updated_date, created_by_id.
--  * Embedded arrays (Transaction.items, Return.items) are normalized into
--    transaction_items / return_items.
--  * Product.category references Category by NAME (as the app stores it).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. app_users  (Base44 "User" entity + built-in fields)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  full_name     text,
  display_name  text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  created_by_id text
);

COMMENT ON TABLE  app_users IS 'Application users; accounts are created by administrators only.';
COMMENT ON COLUMN app_users.role IS 'admin = full management access, user = cashier.';
COMMENT ON COLUMN app_users.display_name IS 'Name shown across POS, returns and admin screens.';

-- ----------------------------------------------------------------------------
-- 2. categories
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  created_by_id text
);

COMMENT ON TABLE categories IS 'Product categories; referenced by products.category (by name).';

-- ----------------------------------------------------------------------------
-- 3. suppliers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  created_by_id text
);

COMMENT ON TABLE suppliers IS 'Vendors that products are purchased from.';

-- ----------------------------------------------------------------------------
-- 4. products
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  sku                 text NOT NULL,
  barcode             text,
  category            text,
  selling_price       numeric(12,2) NOT NULL CHECK (selling_price >= 0),
  wholesale_price     numeric(12,2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  cost_price          numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  stock_quantity      numeric(12,3) NOT NULL DEFAULT 0,
  low_stock_threshold numeric(12,3) NOT NULL DEFAULT 10,
  tax_rate            numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  is_active           boolean NOT NULL DEFAULT true,
  image_url           text,
  supplier_id         text REFERENCES suppliers(id) ON DELETE SET NULL,
  created_date        timestamptz NOT NULL DEFAULT now(),
  updated_date        timestamptz NOT NULL DEFAULT now(),
  created_by_id       text,
  CONSTRAINT fk_products_category
    FOREIGN KEY (category) REFERENCES categories(name) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category    ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_supplier    ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_sku         ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode     ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_active      ON products(is_active);

COMMENT ON TABLE  products IS 'Product catalog, prices and current stock on hand.';
COMMENT ON COLUMN products.category IS 'Category name (denormalized reference to categories.name).';
COMMENT ON COLUMN products.wholesale_price IS 'Bulk price per unit; retail price is used when unset (0).';
COMMENT ON COLUMN products.cost_price IS 'Supplier cost, used for margin and profit calculations.';
COMMENT ON COLUMN products.tax_rate IS 'Tax percentage, e.g. 10 means 10%.';

-- ----------------------------------------------------------------------------
-- 5. shifts  (cashier till sessions)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id                      text PRIMARY KEY,
  cashier_email           text NOT NULL REFERENCES app_users(email) ON UPDATE CASCADE,
  cashier_name            text,
  start_time              timestamptz NOT NULL,
  end_time                timestamptz,
  status                  text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total_cash_sales        numeric(12,2) NOT NULL DEFAULT 0,
  total_card_sales        numeric(12,2) NOT NULL DEFAULT 0,
  total_electronic_sales  numeric(12,2) NOT NULL DEFAULT 0,
  total_revenue           numeric(12,2) NOT NULL DEFAULT 0,
  total_transactions      integer       NOT NULL DEFAULT 0,
  total_cost              numeric(12,2) NOT NULL DEFAULT 0,
  total_profit            numeric(12,2) NOT NULL DEFAULT 0,
  created_date            timestamptz NOT NULL DEFAULT now(),
  updated_date            timestamptz NOT NULL DEFAULT now(),
  created_by_id           text
);

CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON shifts(cashier_email);
CREATE INDEX IF NOT EXISTS idx_shifts_status  ON shifts(status);

COMMENT ON TABLE shifts IS 'Cashier shifts (till sessions) with running totals.';

-- ----------------------------------------------------------------------------
-- 6. transactions  (retail sales and wholesale orders)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id                 text PRIMARY KEY,
  transaction_number text NOT NULL UNIQUE,
  sale_type          text NOT NULL DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale')),
  customer_name      text,
  cashier_email      text NOT NULL REFERENCES app_users(email) ON UPDATE CASCADE,
  cashier_name       text,
  subtotal           numeric(12,2) NOT NULL DEFAULT 0,
  tax_total          numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount    numeric(12,2) NOT NULL DEFAULT 0,
  grand_total        numeric(12,2) NOT NULL DEFAULT 0,
  total_cost         numeric(12,2) NOT NULL DEFAULT 0,
  gross_profit       numeric(12,2) NOT NULL DEFAULT 0,
  payment_method     text NOT NULL CHECK (payment_method IN ('cash', 'card', 'electronic')),
  amount_paid        numeric(12,2) NOT NULL DEFAULT 0,
  change_given       numeric(12,2) NOT NULL DEFAULT 0,
  shift_id           text REFERENCES shifts(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'voided')),
  created_date       timestamptz NOT NULL DEFAULT now(),
  updated_date       timestamptz NOT NULL DEFAULT now(),
  created_by_id      text
);

CREATE INDEX IF NOT EXISTS idx_transactions_cashier     ON transactions(cashier_email);
CREATE INDEX IF NOT EXISTS idx_transactions_shift       ON transactions(shift_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_sale_type   ON transactions(sale_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created     ON transactions(created_date);

COMMENT ON TABLE  transactions IS 'Retail sales (TX-…) and wholesale orders (WS-…).';
COMMENT ON COLUMN transactions.transaction_number IS 'TX- for retail sales, WS- for wholesale orders.';
COMMENT ON COLUMN transactions.gross_profit IS 'grand_total - total_cost.';

-- ----------------------------------------------------------------------------
-- 7. transaction_items  (Transaction.items array, normalized)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_items (
  id             text PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  line_no        integer NOT NULL DEFAULT 1,
  product_id     text REFERENCES products(id) ON DELETE SET NULL,
  product_name   text NOT NULL,
  sku            text,
  quantity       numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     numeric(12,2) NOT NULL DEFAULT 0,
  cost_price     numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate       numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount     numeric(12,2) NOT NULL DEFAULT 0,
  line_total     numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_transaction_items_tx      ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id);

COMMENT ON TABLE transaction_items IS 'Sale line items; name, SKU and prices are snapshotted at sale time.';

-- ----------------------------------------------------------------------------
-- 8. returns  (refunds against a sale)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS returns (
  id                          text PRIMARY KEY,
  return_number               text NOT NULL UNIQUE,
  original_transaction_number text REFERENCES transactions(transaction_number) ON UPDATE CASCADE ON DELETE SET NULL,
  cashier_email               text NOT NULL REFERENCES app_users(email) ON UPDATE CASCADE,
  cashier_name                text,
  total_refund                numeric(12,2) NOT NULL DEFAULT 0,
  total_cost_recovered        numeric(12,2) NOT NULL DEFAULT 0,
  total_cost_lost             numeric(12,2) NOT NULL DEFAULT 0,
  profit_impact               numeric(12,2) NOT NULL DEFAULT 0,
  refund_method               text NOT NULL CHECK (refund_method IN ('cash', 'card', 'electronic', 'store_credit')),
  reason                      text,
  status                      text NOT NULL DEFAULT 'processed' CHECK (status IN ('processed', 'voided')),
  created_date                timestamptz NOT NULL DEFAULT now(),
  updated_date                timestamptz NOT NULL DEFAULT now(),
  created_by_id               text
);

CREATE INDEX IF NOT EXISTS idx_returns_cashier   ON returns(cashier_email);
CREATE INDEX IF NOT EXISTS idx_returns_original  ON returns(original_transaction_number);
CREATE INDEX IF NOT EXISTS idx_returns_created   ON returns(created_date);

COMMENT ON TABLE  returns IS 'Product returns; a missing original receipt number means a manual return.';
COMMENT ON COLUMN returns.profit_impact IS 'Negative effect of the return on profit.';

-- ----------------------------------------------------------------------------
-- 9. return_items  (Return.items array, normalized)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS return_items (
  id             text PRIMARY KEY,
  return_id      text NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  line_no        integer NOT NULL DEFAULT 1,
  product_id     text REFERENCES products(id) ON DELETE SET NULL,
  product_name   text NOT NULL,
  sku            text,
  quantity       numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     numeric(12,2) NOT NULL DEFAULT 0,
  cost_price     numeric(12,2) NOT NULL DEFAULT 0,
  refund_amount  numeric(12,2) NOT NULL DEFAULT 0,
  condition      text NOT NULL DEFAULT 'good' CHECK (condition IN ('good', 'damaged')),
  restocked      boolean NOT NULL DEFAULT false,
  cost_recovered numeric(12,2) NOT NULL DEFAULT 0,
  cost_lost      numeric(12,2) NOT NULL DEFAULT 0,
  profit_impact  numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_return_items_return  ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_product ON return_items(product_id);

COMMENT ON TABLE  return_items IS 'Returned line items; good = restocked, damaged = written off.';

-- ----------------------------------------------------------------------------
-- 10. stock_adjustments  (manual stock change audit log)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id                text PRIMARY KEY,
  product_id        text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name      text NOT NULL,
  sku               text,
  previous_quantity numeric(12,3) NOT NULL,
  new_quantity      numeric(12,3) NOT NULL,
  delta             numeric(12,3) NOT NULL,
  reason            text NOT NULL,
  user_email        text NOT NULL REFERENCES app_users(email) ON UPDATE CASCADE,
  user_name         text,
  created_date      timestamptz NOT NULL DEFAULT now(),
  updated_date      timestamptz NOT NULL DEFAULT now(),
  created_by_id     text
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_user    ON stock_adjustments(user_email);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created ON stock_adjustments(created_date);

COMMENT ON TABLE  stock_adjustments IS 'Audit log of every manual stock quantity change (delta = new - previous).';

COMMIT;

-- ============================================================================
-- TEMPLATE — copy this block to create a new table
-- ============================================================================
-- CREATE TABLE IF NOT EXISTS new_table (
--   id            text PRIMARY KEY,
--   name          text NOT NULL,
--   product_id    text REFERENCES products(id) ON DELETE SET NULL,
--   user_email    text REFERENCES app_users(email) ON UPDATE CASCADE,
--   amount        numeric(12,2) NOT NULL DEFAULT 0,
--   quantity      numeric(12,3) NOT NULL DEFAULT 0,
--   status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
--   is_active     boolean NOT NULL DEFAULT true,
--   notes         text,
--   created_date  timestamptz NOT NULL DEFAULT now(),
--   updated_date  timestamptz NOT NULL DEFAULT now(),
--   created_by_id text
-- );
-- CREATE INDEX IF NOT EXISTS idx_new_table_product ON new_table(product_id);
-- CREATE INDEX IF NOT EXISTS idx_new_table_created ON new_table(created_date);