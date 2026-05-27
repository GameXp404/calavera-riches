// GET /api/admin/jackpot — read state
// PATCH /api/admin/jackpot — body: { enabled?, mini_seed?, mini_pct?, ... }
// POST /api/admin/jackpot — body: { action: 'trigger', tier, username } | { action: 'reset' }
import { supabase } from '../_lib/supabase.js';
import { isAdminReq, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdminReq(req)) return jsonError(res, 401, 'Admin password required');

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('jackpot').select('*').eq('id', 'default').single();
    if (error) return jsonError(res, 500, error.message);
    return jsonOk(res, data);
  }

  if (req.method === 'PATCH') {
    const allowedFields = [
      'enabled',
      'mini_seed', 'mini_pct', 'mini_pool',
      'minor_seed', 'minor_pct', 'minor_pool',
      'major_seed', 'major_pct', 'major_pool',
      'grand_seed', 'grand_pct', 'grand_pool',
    ];
    const patch = {};
    for (const k of allowedFields) {
      if (k in (req.body || {})) patch[k] = req.body[k];
    }
    if (Object.keys(patch).length === 0) return jsonError(res, 400, 'No valid fields');
    const { error } = await supabase.from('jackpot').update(patch).eq('id', 'default');
    if (error) return jsonError(res, 500, error.message);
    return jsonOk(res, { ok: true });
  }

  if (req.method === 'POST') {
    const { action, tier, username } = req.body || {};
    const { data: jp, error: fetchErr } = await supabase.from('jackpot').select('*').eq('id', 'default').single();
    if (fetchErr) return jsonError(res, 500, fetchErr.message);

    if (action === 'reset') {
      const { error } = await supabase.from('jackpot').update({
        mini_pool: jp.mini_seed, minor_pool: jp.minor_seed,
        major_pool: jp.major_seed, grand_pool: jp.grand_seed,
      }).eq('id', 'default');
      if (error) return jsonError(res, 500, error.message);
      return jsonOk(res, { ok: true });
    }

    if (action === 'trigger') {
      if (!['mini', 'minor', 'major', 'grand'].includes(tier)) return jsonError(res, 400, 'Invalid tier');
      if (!username) return jsonError(res, 400, 'username required');
      const pool = jp[`${tier}_pool`];
      const seed = jp[`${tier}_seed`];
      if (pool <= 0) return jsonError(res, 400, 'Pool kosong');

      // Queue jackpot as pending bonus on target user
      const { data: target, error: tErr } = await supabase.from('players')
        .select('id, pending_bonus_amount').eq('username', username).single();
      if (tErr || !target) return jsonError(res, 404, 'User not found');
      const newPending = (target.pending_bonus_amount || 0) + pool;
      await supabase.from('players').update({
        pending_bonus_amount: newPending,
        pending_bonus_tier: 'jackpot-' + tier,
      }).eq('id', target.id);

      // Reset pool + record last_triggered
      await supabase.from('jackpot').update({
        [`${tier}_pool`]: seed,
        last_triggered: { tier, user: username, amount: pool, at: new Date().toISOString() },
      }).eq('id', 'default');

      // Big-win log
      await supabase.from('big_wins').insert({
        username, tier: 'JACKPOT-' + tier.toUpperCase(),
        amount: pool, bet: 0, multiplier: 0,
      });

      return jsonOk(res, { ok: true, amount: pool, tier, user: username });
    }

    return jsonError(res, 400, 'Unknown action');
  }

  return jsonError(res, 405, 'Method not allowed');
}
