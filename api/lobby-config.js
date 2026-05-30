// GET /api/lobby-config — public (no auth)
// Operator-controlled live-display settings (set in admin) for lobby + games:
//   onlineEnabled (bool)   — show the "N bermain" player counter
//   onlineManual  (int)    — fixed online number (0 = auto/animated by time-of-day)
//   winfeedEnabled (bool)  — show the scrolling live win feed
// Admin writes via PATCH /api/admin/settings { key, value } with keys:
//   online_enabled, online_manual, winfeed_enabled
import { supabase } from './_lib/supabase.js';
import { jsonError, jsonOk } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const { data } = await supabase
    .from('settings')
    .select('key,value')
    .in('key', ['online_enabled', 'online_manual', 'winfeed_enabled']);

  const s = {};
  (data || []).forEach((r) => { s[r.key] = r.value; });

  const truthy = (v, def) => (v == null ? def : !(v === false || v === 'false' || v === 0 || v === '0'));
  const onlineEnabled = truthy(s.online_enabled, true);
  const winfeedEnabled = truthy(s.winfeed_enabled, true);

  let onlineManual = 0;
  if (s.online_manual != null) {
    const n = typeof s.online_manual === 'number' ? s.online_manual : parseInt(s.online_manual, 10);
    if (!Number.isNaN(n) && n > 0) onlineManual = n;
  }

  return jsonOk(res, { onlineEnabled, onlineManual, winfeedEnabled });
}
