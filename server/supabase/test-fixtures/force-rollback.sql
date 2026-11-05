-- STAGING TEST FIXTURE ONLY. Never in supabase/migrations, never on production.
-- Installed and removed by the integration test runner behind the staging guard.
--
-- Raises an error on the LAST write of each atomic operation, but only for
-- rows whose name carries the marker '__force_rollback__', so ordinary
-- staging data and other test runs are never affected (T7).
--   sales / shift close      -> UPDATE public.shifts (cashier_name has the marker)
--   returns / inventory / PATCH product -> INSERT public.stock_adjustments (product_name has the marker)

CREATE SCHEMA IF NOT EXISTS b12_test;
REVOKE ALL ON SCHEMA b12_test FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION b12_test.force_rollback()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (TG_TABLE_NAME = 'shifts' AND NEW.cashier_name LIKE '%\_\_force\_rollback\_\_%')
     OR (TG_TABLE_NAME = 'stock_adjustments' AND NEW.product_name LIKE '%\_\_force\_rollback\_\_%') THEN
    RAISE EXCEPTION 'b12_test: forced failure on %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_b12_test_force_rollback ON public.shifts;
CREATE TRIGGER zz_b12_test_force_rollback BEFORE UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION b12_test.force_rollback();

DROP TRIGGER IF EXISTS zz_b12_test_force_rollback ON public.stock_adjustments;
CREATE TRIGGER zz_b12_test_force_rollback BEFORE INSERT ON public.stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION b12_test.force_rollback();
