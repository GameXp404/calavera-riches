// POST /api/player/spin-record
// Header: Authorization: Bearer <token>
// Body: { bet, win, tier, scatterCount, isFreeSpinSpin }
// Records the result of a spin: deducts bet (unless free spin), credits win,
// updates stats, contributes to jackpot pool, logs big wins.
//
// SECURITY NOTE: For Phase 1, server TRUSTS client win amount but does sanity
// checks (max 2500x bet per spin matching paytable max).
// Phase 2+: move RNG + win evaluation server-side for full anti-cheat.
import { supabase } from '../_lib/supabase.js';
import { getUserFromReq, jsonError, jsonOk } from '../_lib/auth.js';

const MAX_WIN_MULT = 3000; // sanity cap: max win 3000x of bet per single spin

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const user = getUserFromReq(req);
  if (!user) return jsonError(res, 401, 'Not authenticated');

  const { bet, win, tier, scatterCount, isFreeSpinSpin } = req.body || {};
  const betAmount = Math.max(0, Math.floor(Number(bet) || 0));
  const winAmount = Math.max(0, Math.floor(Number(win) || 0));

  if (betAmount <= 0 && !isFreeSpinSpin) return jsonError(res, 400, 'Invalid bet');

  // Sanity check: win must not exceed MAX_WIN_MULT * bet (anti-tamper)
  if (betAmount > 0 && winAmount > betAmount * MAX_WIN_MULT) {
    console.warn('[spin-record] Win exceeds sanity cap', { user: user.username, bet: betAmount, win: winAmount });
    return jsonError(res, 400, 'Win amount exceeds maximum allowed');
  }

  // Fetch current player + check frozen
  const { data: player, error: fetchErr } = await supabase
    .from('players').select('balance, total_bet, total_win, spins, biggest_win, frozen').eq('id', user.id).single();
  if (fetchErr || !player) return jsonError(res, 404, 'Player not found');
  if (player.frozen) return jsonError(res, 403, 'Account frozen');

  // Calculate new state
  const deductBet = isFreeSpinSpin ? 0 : betAmount;
  if (player.balance < deductBet) return jsonError(res, 400, 'Insufficient balance');
  const newBalance = player.balance - deductBet + winAmount;
  const newTotalBet = player.total_bet + deductBet;
  const newTotalWin = player.total_win + winAmount;
  const newSpins = player.spins + 1;
  const newBiggestWin = Math.max(player.biggest_win, winAmount);

  // Update player
  const { error: updateErr } = await supabase.from('players').update({
    balance: newBalance,
    total_bet: newTotalBet,
    total_win: newTotalWin,
    spins: newSpins,
    biggest_win: newBiggestWin,
    last_spin: new Date().toISOString(),
  }).eq('id', user.id);
  if (updateErr) return jsonError(res, 500, 'Update failed: ' + updateErr.message);

  // Record transaction
  await supabase.from('transactions').insert({
    username: user.username,
    type: 'spin',
    amount: winAmount - deductBet,
    balance_after: newBalance,
    meta: { bet: deductBet, win: winAmount, tier: tier || null, scatters: scatterCount || 0 },
  });

  // Big-win log (MEGA/EPIC/LEGENDARY)
  if (tier && /MEGA|EPIC|LEGENDARY/i.test(tier) && winAmount > 0) {
    await supabase.from('big_wins').insert({
      username: user.username,
      tier: tier.toUpperCase(),
      amount: winAmount,
      bet: betAmount,
      multiplier: betAmount > 0 ? Math.round((winAmount / betAmount) * 100) / 100 : 0,
    });
  }

  // Progressive jackpot contribution (if enabled)
  if (deductBet > 0) {
    const { data: jp } = await supabase.from('jackpot').select('*').eq('id', 'default').single();
    if (jp?.enabled) {
      const patch = {
        mini_pool:  jp.mini_pool  + Math.floor(deductBet * (jp.mini_pct  || 0) / 100),
        minor_pool: jp.minor_pool + Math.floor(deductBet * (jp.minor_pct || 0) / 100),
        major_pool: jp.major_pool + Math.floor(deductBet * (jp.major_pct || 0) / 100),
        grand_pool: jp.grand_pool + Math.floor(deductBet * (jp.grand_pct || 0) / 100),
      };
      await supabase.from('jackpot').update(patch).eq('id', 'default');
    }
  }

  jsonOk(res, { balance: newBalance, stats: { spins: newSpins, total_bet: newTotalBet, total_win: newTotalWin, biggest_win: newBiggestWin } });
}
