// GET /api/me
// Header: Authorization: Bearer <token>
// Returns: current player state (full profile).
import { supabase } from './_lib/supabase.js';
import { getUserFromReq, jsonError, jsonOk } from './_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const user = getUserFromReq(req);
  if (!user) return jsonError(res, 401, 'Not authenticated');

  const { data: player, error } = await supabase
    .from('players')
    .select('id, username, balance, bet_idx, turbo, ante_bet, spins, total_bet, total_win, biggest_win, frozen')
    .eq('id', user.id).single();

  if (error || !player) return jsonError(res, 404, 'Player not found');
  if (player.frozen) return jsonError(res, 403, 'Akun dibekukan admin');

  jsonOk(res, { user: player });
}
