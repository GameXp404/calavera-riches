// GET /api/admin/users — list all
// PATCH /api/admin/users — body: { username, balance?, frozen?, pending_bonus?, action? }
// Header: X-Admin-Password: <admin pass>
import { supabase } from '../_lib/supabase.js';
import { isAdminReq, hashPassword, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdminReq(req)) return jsonError(res, 401, 'Admin password required');

  if (req.method === 'GET') {
    const { data: players, error } = await supabase
      .from('players')
      .select('id, username, balance, spins, total_bet, total_win, biggest_win, frozen, pending_bonus_amount, pending_bonus_tier, last_login, last_spin, registered_at, password_hash')
      .order('balance', { ascending: false });
    if (error) return jsonError(res, 500, error.message);
    // Strip password hash (admin doesn't need it, but mark hasPassword)
    const safe = players.map((p) => ({
      ...p,
      hasPassword: !!p.password_hash,
      password_hash: undefined,
    }));
    return jsonOk(res, { users: safe });
  }

  if (req.method === 'PATCH') {
    const { username, balance, frozen, pending_bonus, set_password, action } = req.body || {};
    if (!username) return jsonError(res, 400, 'username required');

    if (action === 'delete') {
      const { error } = await supabase.from('players').delete().eq('username', username);
      if (error) return jsonError(res, 500, error.message);
      return jsonOk(res, { ok: true, deleted: username });
    }

    if (action === 'reset_stats') {
      const { error } = await supabase.from('players').update({
        spins: 0, total_bet: 0, total_win: 0, biggest_win: 0,
      }).eq('username', username);
      if (error) return jsonError(res, 500, error.message);
      return jsonOk(res, { ok: true });
    }

    const patch = {};
    if (typeof balance === 'number' && balance >= 0) patch.balance = Math.floor(balance);
    if (typeof frozen === 'boolean') patch.frozen = frozen;
    if (typeof pending_bonus === 'number' && pending_bonus >= 0) {
      // Add to existing pending bonus
      const { data: cur } = await supabase.from('players').select('pending_bonus_amount').eq('username', username).single();
      patch.pending_bonus_amount = (cur?.pending_bonus_amount || 0) + Math.floor(pending_bonus);
    }
    if (typeof set_password === 'string' && set_password.length > 0) {
      patch.password_hash = hashPassword(set_password);
    } else if (set_password === '') {
      // Clear password
      patch.password_hash = '';
    }

    if (Object.keys(patch).length === 0) return jsonError(res, 400, 'No valid fields');

    const { error } = await supabase.from('players').update(patch).eq('username', username);
    if (error) return jsonError(res, 500, error.message);

    if (typeof balance === 'number') {
      // Record admin balance change
      await supabase.from('transactions').insert({
        username, type: 'admin_set', amount: 0, balance_after: balance,
        meta: { admin: true, action: 'set_balance' },
      });
    }
    return jsonOk(res, { ok: true });
  }

  // POST = create new user (admin pre-register)
  if (req.method === 'POST') {
    const { username, password, balance = 1000000 } = req.body || {};
    if (!username) return jsonError(res, 400, 'username required');
    if (!password) return jsonError(res, 400, 'password required');
    const { data, error } = await supabase.from('players').insert({
      username,
      password_hash: hashPassword(password),
      balance: Math.max(0, Math.floor(balance)),
      last_login: null,
    }).select('id, username, balance').single();
    if (error) return jsonError(res, error.code === '23505' ? 409 : 500, error.message);
    return jsonOk(res, { user: data });
  }

  return jsonError(res, 405, 'Method not allowed');
}
