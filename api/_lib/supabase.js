// Server-side Supabase client (uses SERVICE_ROLE_KEY — bypasses RLS).
// ONLY for API endpoints — never expose to browser.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
