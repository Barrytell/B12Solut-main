-- Storage buckets (A12). No policies are created on storage.objects for either
-- bucket, so anon/authenticated clients cannot list, upload, update or delete.
--   product-images: public = true -> objects viewable through their public URL.
--   shift-reports:  private       -> reachable only via 10-minute signed URLs
--                                    issued by the API (GET /api/shifts/:id/report-url).
-- The API writes both buckets with the secret key.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-images', 'product-images', true,  5242880,  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('shift-reports',  'shift-reports',  false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
