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

  const GAME_IDS = ['calavera', 'knight'];   // games shown in the lobby

  const keys = ['online_enabled', 'online_manual', 'winfeed_enabled'];
  GAME_IDS.forEach((g) => { keys.push(`players_${g}`, `players_${g}_enabled`); });

  const { data } = await supabase.from('settings').select('key,value').in('key', keys);

  const s = {};
  (data || []).forEach((r) => { s[r.key] = r.value; });

  const truthy = (v, def) => (v == null ? def : !(v === false || v === 'false' || v === 0 || v === '0'));
  const toInt = (v) => { if (v == null) return 0; const n = typeof v === 'number' ? v : parseInt(v, 10); return (!Number.isNaN(n) && n > 0) ? n : 0; };

  const onlineEnabled = truthy(s.online_enabled, true);
  const winfeedEnabled = truthy(s.winfeed_enabled, true);
  const onlineManual = toInt(s.online_manual);

  // Per-game: each game has its own on/off + manual count (0 = auto-animated)
  const gamePlayers = {};
  GAME_IDS.forEach((g) => {
    gamePlayers[g] = { enabled: truthy(s[`players_${g}_enabled`], true), count: toInt(s[`players_${g}`]) };
  });

  return jsonOk(res, { onlineEnabled, onlineManual, winfeedEnabled, gamePlayers });
}
