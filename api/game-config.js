// GET /api/game-config?game=knight
// Public (no auth) — returns operator-set difficulty for a game.
// Difficulty controls the in-game RTP weight table (0=Easy, 1=Medium, 2=Hard).
// Admin sets it via PATCH /api/admin/settings { key: '<game>_difficulty', value: 0|1|2 }.
import { supabase } from './_lib/supabase.js';
import { jsonError, jsonOk } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const m = (req.url || '').match(/[?&]game=([a-z0-9_]+)/i);
  const game = m ? m[1].toLowerCase() : 'knight';
  const key = `${game}_difficulty`;

  const { data } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();

  let difficulty = 1; // default = Medium
  if (data && data.value != null) {
    const n = typeof data.value === 'number' ? data.value : parseInt(data.value, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 2) difficulty = n;
  }

  return jsonOk(res, { game, difficulty });
}
