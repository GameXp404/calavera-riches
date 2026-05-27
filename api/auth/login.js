// POST /api/auth/login
// Body: { username, password }
// Returns: { token, user, bonus?, broadcast? } on success.
import { supabase } from '../_lib/supabase.js';
import { signToken, hashPassword, sanitizeUsername, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const { username: rawUser, password } = req.body || {};
  const username = sanitizeUsername(rawUser);
  if (!username) return jsonError(res, 400, 'Username tidak valid');
  if (!password) return jsonError(res, 400, 'Password wajib diisi');

  // Maintenance gate
  const { data: maint } = await supabase
    .from('settings').select('value').eq('key', 'maintenance').single();
  if (maint?.value === true) return jsonError(res, 503, '🚧 Game sedang maintenance');

  // Fetch player (case-insensitive, exclude soft-deleted)
  const { data: player, error: fetchErr } = await supabase
    .from('players').select('*').ilike('username', username).is('deleted_at', null).maybeSingle();
  if (fetchErr) return jsonError(res, 500, 'DB error: ' + fetchErr.message);
  if (!player) return jsonError(res, 401, 'Username atau password salah');

  // Verify hash
  if (player.password_hash !== hashPassword(password)) {
    return jsonError(res, 401, 'Username atau password salah');
  }

  // Frozen?
  if (player.frozen) {
    return jsonError(res, 403, `❄️ Akun "${username}" dibekukan admin. Hubungi admin.`);
  }

  // Apply pending bonus (if queued)
  let bonusApplied = null;
  if (player.pending_bonus_amount > 0) {
    const newBalance = player.balance + player.pending_bonus_amount;
    await supabase.from('players').update({
      balance: newBalance,
      pending_bonus_amount: 0,
      pending_bonus_tier: null,
      last_login: new Date().toISOString(),
    }).eq('id', player.id);

    // Record transaction
    await supabase.from('transactions').insert({
      username, type: 'bonus',
      amount: player.pending_bonus_amount,
      balance_after: newBalance,
      meta: { tier: player.pending_bonus_tier || null, source: 'admin_queue' },
    });

    bonusApplied = {
      amount: player.pending_bonus_amount,
      tier: player.pending_bonus_tier,
    };
    player.balance = newBalance;
    player.pending_bonus_amount = 0;
    player.pending_bonus_tier = null;
  } else {
    await supabase.from('players').update({ last_login: new Date().toISOString() }).eq('id', player.id);
  }

  // Check broadcast (show only if not dismissed by this user)
  const { data: bcastRow } = await supabase
    .from('settings').select('value').eq('key', 'broadcast').single();
  let broadcast = null;
  if (bcastRow?.value && typeof bcastRow.value === 'object' && bcastRow.value.message) {
    const dismissed = bcastRow.value.dismissedBy || {};
    if (!dismissed[username]) {
      broadcast = bcastRow.value.message;
      dismissed[username] = true;
      await supabase.from('settings').update({
        value: { ...bcastRow.value, dismissedBy: dismissed },
      }).eq('key', 'broadcast');
    }
  }

  const token = signToken({ id: player.id, username: player.username });
  jsonOk(res, {
    token,
    user: {
      id: player.id,
      username: player.username,
      balance: player.balance,
      bet_idx: player.bet_idx,
      turbo: player.turbo,
      ante_bet: player.ante_bet,
      spins: player.spins,
      total_bet: player.total_bet,
      total_win: player.total_win,
      biggest_win: player.biggest_win,
    },
    bonus: bonusApplied,
    broadcast,
  });
}
