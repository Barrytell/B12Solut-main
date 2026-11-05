-- B12 Store Solution: application schema (from docs/schema/schema.sql + design S1-S14).
-- Applied with `supabase db push --linked` (staging first; production only with approval).

-- S3: updated_date maintained by the database. The import keeps original
-- timestamps by setting b12.preserve_updated_date = 'on' for its session only.
CREATE OR REPLACE FUNCTION public.set_updated_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF coalesce(current_setting('b12.preserve_updated_date', true), '') <> 'on' THEN
    NEW.updated_date := now();
  END IF;
  RETURN NEW;
END;
$$;

-- 1. app_users -------------------------------------------------------------
CREATE TABLE public.app_users (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,          -- S1
  email         text NOT NULL UNIQUE,
  full_name     text,
  display_name  text,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  auth_user_id  uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,  -- S2
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  created_by_id text
);
COMMENT ON TABLE  public.app_users IS 'Application users; accounts are created by administrators only (invites).';
COMMENT ON COLUMN public.app_users.role IS 'admin = full management access, user = cashier. Authorization reads this, never JWT metadata.';
COMMENT ON COLUMN public.app_users.auth_user_id IS 'Supabase Auth user, set when invited. The API matches sessions on this column only.';

-- 2. categories ------------------------------------------------------------
CREATE TABLE public.categories (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name          text NOT NULL UNIQUE,
  created_date  timestamptz NOT NULL DEFAULT now(),
  updated_date  timestamptz NOT NULL DEFAULT now(),
  created_by_id text
);

-- 3. suppliers -------------------------------------------------------------
CREATE TABLE public.suppliers (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
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

-- 4. products --------------------------------------------------------------
CREATE TABLE public.products (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                text NOT NULL,
  sku                 text NOT NULL,
  barcode             text,
  category            text REFERENCES public.categories(name) ON UPDATE CASCADE ON DELETE SET NULL,
  selling_price       numeric(12,2) NOT NULL CHECK (selling_price >= 0),
  wholesale_price     numeric(12,2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  cost_price          numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  stock_quantity      numeric(12,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),  -- S6
  low_stock_threshold numeric(12,3) NOT NULL DEFAULT 10,
  tax_rate            numeric(5,2)  NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  is_active           boolean NOT NULL DEFAULT true,
  image_url           text,
  supplier_id         text REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_date        timestamptz NOT NULL DEFAULT now(),
  updated_date        timestamptz NOT NULL DEFAULT now(),
  created_by_id       text
);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_supplier ON public.products(supplier_id);
CREATE INDEX idx_products_sku      ON public.products(sku);
CREATE INDEX idx_products_barcode  ON public.products(barcode);
CREATE INDEX idx_products_active   ON public.products(is_active);
COMMENT ON COLUMN public.products.wholesale_price IS 'Bulk price per unit; retail price is used when unset (0).';
COMMENT ON COLUMN public.products.stock_quantity IS 'Never negative (D4); changed only by the API, each change audited in stock_adjustments (D3).';

-- 5. shifts ----------------------------------------------------------------
CREATE TABLE public.shifts (
  id                      text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cashier_email           text NOT NULL REFERENCES public.app_users(email) ON UPDATE CASCADE,
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
  declared_cash           numeric(12,2) CHECK (declared_cash >= 0),  -- S14
  report_path             text,                                       -- S13
  created_date            timestamptz NOT NULL DEFAULT now(),
  updated_date            timestamptz NOT NULL DEFAULT now(),
  created_by_id           text
);
CREATE INDEX idx_shifts_cashier ON public.shifts(cashier_email);
CREATE INDEX idx_shifts_status  ON public.shifts(status);
CREATE INDEX idx_shifts_created ON public.shifts(created_date DESC);                          -- S12
CREATE UNIQUE INDEX uq_shifts_one_open_per_cashier ON public.shifts(cashier_email) WHERE status = 'open';  -- S4
COMMENT ON COLUMN public.shifts.declared_cash IS 'Cash counted by the cashier at close; variance is computed by the server.';
COMMENT ON COLUMN public.shifts.report_path IS 'Object path of the official PDF in the private shift-reports bucket.';

-- 6. transactions ----------------------------------------------------------
CREATE TABLE public.transactions (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  transaction_number text NOT NULL UNIQUE,
  client_request_id  text UNIQUE,                                                 -- S5
  sale_type          text NOT NULL DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale')),
  customer_name      text,
  cashier_email      text NOT NULL REFERENCES public.app_users(email) ON UPDATE CASCADE,
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
  shift_id           text REFERENCES public.shifts(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'voided')),
  created_date       timestamptz NOT NULL DEFAULT now(),
  updated_date       timestamptz NOT NULL DEFAULT now(),
  created_by_id      text
);
CREATE INDEX idx_transactions_cashier_created ON public.transactions(cashier_email, created_date DESC);  -- S12
CREATE INDEX idx_transactions_type_created    ON public.transactions(sale_type, created_date DESC);      -- S12
CREATE INDEX idx_transactions_shift           ON public.transactions(shift_id);
CREATE INDEX idx_transactions_status          ON public.transactions(status);
CREATE INDEX idx_transactions_created         ON public.transactions(created_date DESC);
COMMENT ON COLUMN public.transactions.client_request_id IS 'Idempotency key from the POS; a retried checkout returns the original sale.';

-- 7. transaction_items -----------------------------------------------------
CREATE TABLE public.transaction_items (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  transaction_id text NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  line_no        integer NOT NULL DEFAULT 1,
  product_id     text REFERENCES public.products(id) ON DELETE SET NULL,
  product_name   text NOT NULL,
  sku            text,
  quantity       numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price     numeric(12,2) NOT NULL DEFAULT 0,
  cost_price     numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate       numeric(5,2)  NOT NULL DEFAULT 0,
  tax_amount     numeric(12,2) NOT NULL DEFAULT 0,
  line_total     numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE (transaction_id, line_no)
);
CREATE INDEX idx_transaction_items_product ON public.transaction_items(product_id);

-- 8. returns ---------------------------------------------------------------
CREATE TABLE public.returns (
  id                          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  return_number               text NOT NULL UNIQUE,
  original_transaction_number text,   -- S7: free text typed at the counter, intentionally no FK
  cashier_email               text NOT NULL REFERENCES public.app_users(email) ON UPDATE CASCADE,
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
CREATE INDEX idx_returns_cashier  ON public.returns(cashier_email);
CREATE INDEX idx_returns_original ON public.returns(original_transaction_number);
CREATE INDEX idx_returns_created  ON public.returns(created_date DESC);

-- 9. return_items ----------------------------------------------------------
CREATE TABLE public.return_items (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  return_id      text NOT NULL REFERENCES public.returns(id) ON DELETE CASCADE,
  line_no        integer NOT NULL DEFAULT 1,
  product_id     text REFERENCES public.products(id) ON DELETE SET NULL,
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
  profit_impact  numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE (return_id, line_no)
);
CREATE INDEX idx_return_items_product ON public.return_items(product_id);

-- 10. stock_adjustments ----------------------------------------------------
CREATE TABLE public.stock_adjustments (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  product_id        text REFERENCES public.products(id) ON DELETE SET NULL,  -- S8: audit survives product deletion
  product_name      text NOT NULL,
  sku               text,
  previous_quantity numeric(12,3) NOT NULL,
  new_quantity      numeric(12,3) NOT NULL,
  delta             numeric(12,3) NOT NULL,
  reason            text NOT NULL,
  user_email        text NOT NULL REFERENCES public.app_users(email) ON UPDATE CASCADE,
  user_name         text,
  created_date      timestamptz NOT NULL DEFAULT now(),
  updated_date      timestamptz NOT NULL DEFAULT now(),
  created_by_id     text
);
CREATE INDEX idx_stock_adjustments_product ON public.stock_adjustments(product_id);
CREATE INDEX idx_stock_adjustments_user    ON public.stock_adjustments(user_email);
CREATE INDEX idx_stock_adjustments_created ON public.stock_adjustments(created_date DESC);
COMMENT ON TABLE public.stock_adjustments IS 'Audit log of every stock change (delta = new - previous).';

-- S3 triggers ---------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_users','categories','suppliers','products','shifts',
                           'transactions','returns','stock_adjustments'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_date BEFORE UPDATE ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION public.set_updated_date()', t);
  END LOOP;
END $$;
