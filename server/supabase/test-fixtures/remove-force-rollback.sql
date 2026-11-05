-- Removes force-rollback.sql. Run by the test runner in `finally`, and safe to re-run.
DROP TRIGGER IF EXISTS zz_b12_test_force_rollback ON public.shifts;
DROP TRIGGER IF EXISTS zz_b12_test_force_rollback ON public.stock_adjustments;
DROP SCHEMA IF EXISTS b12_test CASCADE;
