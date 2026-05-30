// GET /api/rtp?game=<id>&user=<username> — resolve the EFFECTIVE RTP for a game + user.
// Priority (most specific wins):  user > per-game (if override) > global.
// Returns preset, rtp%, difficulty (0/1/2 for legacy game-config), winRate, volatility,
// maxWin, the resolved `source`, and the special-mode config (client applies runtime context).
//
// Operator edits via admin (key `rtp_config` = global/per-game/special, key `rtp_users` = per-user map).
import { supabase } from './_lib/supabase.js';
import { jsonError, jsonOk } from './_lib/auth.js';

const PRESET_RTP = { boost: 97, standard: 92, tight: 87 };

function presetToDifficulty(preset, rtp) {
  if (preset === 'boost') return 0;
  if (preset === 'standard') return 1;
  if (preset === 'tight') return 2;
  // custom → derive from rtp%
  const r = Number(rtp) || 92;
  if (r >= 95) return 0;
  if (r >= 90) return 1;
  return 2;
}

function normLevel(lv) {
  lv = lv || {};
  const preset = lv.preset || 'standard';
  const rtp = (preset === 'custom') ? (Number(lv.rtp) || 92) : (PRESET_RTP[preset] || 92);
  return {
    preset,
    rtp,
    winRate: Number(lv.winRate) || 35,
    volatility: (lv.volatility != null) ? Number(lv.volatility) : 1,
    maxWin: Number(lv.maxWin) || 1000,
    difficulty: presetToDifficulty(preset, rtp),
  };
}

const DEFAULT_CONFIG = {
  global: { preset: 'standard', rtp: 92, winRate: 35, volatility: 1, maxWin: 1000 },
  games: {
    knight: { override: false, preset: 'standard', rtp: 90, winRate: 32, volatility: 1, maxWin: 1000 },
    calavera: { override: false, preset: 'standard', rtp: 92, winRate: 35, volatility: 1, maxWin: 1000 },
  },
  special: {
    newPlayerBoost: { on: false, spins: 20, rtp: 97 },
    pity: { on: false, losses: 8 },
    comeback: { on: false, days: 3, spins: 10 },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  const url = req.url || '';
  const gm = url.match(/[?&]game=([a-z0-9_]+)/i);
  const um = url.match(/[?&]user=([^&]+)/i);
  const game = gm ? gm[1].toLowerCase() : 'knight';
  const user = um ? decodeURIComponent(um[1]) : '';

  const { data } = await supabase.from('settings').select('key,value').in('key', ['rtp_config', 'rtp_users']);
  const s = {};
  (data || []).forEach((r) => { s[r.key] = r.value; });
  const cfg = Object.assign({}, DEFAULT_CONFIG, s.rtp_config || {});
  const users = s.rtp_users || {};

  let level = cfg.global || DEFAULT_CONFIG.global;
  let source = 'global';
  const g = (cfg.games || {})[game];
  if (g && g.override) { level = g; source = 'game'; }
  const u = users[user];
  if (user && u && u.preset) { level = u; source = 'user'; }

  return jsonOk(res, { game, user, source, ...normLevel(level), special: cfg.special || DEFAULT_CONFIG.special });
}
