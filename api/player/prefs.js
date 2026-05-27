// PATCH /api/player/prefs
// Header: Authorization: Bearer <token>
// Body: { bet_idx?, turbo?, ante_bet? }
// Updates player preferences (game state that doesn't involve money).
import { supabase } from '../_lib/supabase.js';
import { getUserFromReq, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return jsonError(res, 405, 'Method not allowed');

  const user = getUserFromReq(req);
  if (!user) return jsonError(res, 401, 'Not authenticated');

  const { bet_idx, turbo, ante_bet } = req.body || {};
  const patch = {};
  if (typeof bet_idx === 'number' && bet_idx >= 0 && bet_idx < 10) patch.bet_idx = bet_idx;
  if (typeof turbo === 'number' && turbo >= 0 && turbo <= 5) patch.turbo = turbo;
  if (typeof ante_bet === 'boolean') patch.ante_bet = ante_bet;

  if (Object.keys(patch).length === 0) return jsonError(res, 400, 'No valid fields');

  const { error } = await supabase.from('players').update(patch).eq('id', user.id);
  if (error) return jsonError(res, 500, 'Update failed: ' + error.message);
  jsonOk(res, { ok: true });
}
