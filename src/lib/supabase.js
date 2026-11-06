import { createClient } from '@supabase/supabase-js';

// Public values only (VITE_*). The publishable key cannot read or write any
// table: RLS denies everything and all data goes through the API.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Fail loudly in the console instead of silently making unauthenticated calls.
  console.error('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set (see .env.example).');
}

export const supabase = createClient(url ?? 'https://invalid.supabase.co', key ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Base URL for auth redirects: VITE_APP_URL in production, the current origin on previews. */
export const appUrl = () => (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, '');
