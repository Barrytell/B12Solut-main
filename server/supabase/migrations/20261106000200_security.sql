-- S11: the browser never talks to these tables. All access goes through the
-- Express API, which connects as the database owner. RLS is enabled with NO
-- policies (deny all for anon/authenticated) and table privileges are revoked,
-- so a leaked publishable key can read or change nothing via the Data API.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['app_users','categories','suppliers','products','shifts','transactions',
                           'transaction_items','returns','return_items','stock_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- RLS is not FORCEd: the API connects as the table owner (postgres), which owners
-- bypass by design; only anon/authenticated (Data API) are denied.

REVOKE EXECUTE ON FUNCTION public.set_updated_date() FROM PUBLIC, anon, authenticated;

-- Future objects created in public are not exposed by default either.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
