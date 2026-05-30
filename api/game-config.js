// GET /api/game-config?game=<id>&user=<username>
// Public (no auth). Returns operator-set difficulty + resolved RTP for a game (+ optional user).
//
// Difficulty (0=Easy,1=Medium,2=Hard) drives the in-game RTP weight table (legacy contract — the
// games already read this). The RTP control panel (admin) writes a richer `rtp_config` / `rtp_users`;
// this endpoint resolves the EFFECTIVE level with priority:  user > per-game (if override) > global,
// and still returns `difficulty` so existing games keep working unchanged.
import { supabase } from './_lib/supabase.js';
import { jsonError, jsonOk } from './_lib/auth.js';

const PRESET_RTP = { boost: 97, standard: 92, tight: 87 };

function presetToDifficulty(preset, rtp) {
  if (preset === 'boost') return 0;
  if (preset === 'standard') return 1;
  if (preset === 'tight') return 2;
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
    knight: { override: false, preset: 'standard', rtp: 90, winRate: 32 },
    calavera: { override: false, preset: 'standard', rtp: 92, winRate: 35 },
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

  const { data } = await supabase
    .from('settings')
    .select('key,value')
    .in('key', ['rtp_config', 'rtp_users', `${game}_difficulty`]);
  const s = {};
  (data || []).forEach((r) => { s[r.key] = r.value; });

  const out = { game, difficulty: 1, source: 'default' };

  if (s.rtp_config) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, s.rtp_config);
    const users = s.rtp_users || {};
    let level = cfg.global || DEFAULT_CONFIG.global;
    let source = 'global';
    const g = (cfg.games || {})[game];
    if (g && g.override) { level = g; source = 'game'; }
    const u = users[user];
    if (user && u && u.preset) { level = u; source = 'user'; }
    Object.assign(out, normLevel(level), { source, special: cfg.special || DEFAULT_CONFIG.special });
  } else if (s[`${game}_difficulty`] != null) {
    const n = typeof s[`${game}_difficulty`] === 'number' ? s[`${game}_difficulty`] : parseInt(s[`${game}_difficulty`], 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 2) { out.difficulty = n; out.source = 'legacy'; }
  }

  return jsonOk(res, out);
}
