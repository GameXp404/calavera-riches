// GET /api/theme — public lobby appearance settings (operator-editable in admin).
// Stored as a single jsonb blob under settings key `lobby_theme`; merged over DEFAULTS
// so newly-added fields always have a sane fallback even on old saved data.
import { supabase } from './_lib/supabase.js';
import { jsonError, jsonOk } from './_lib/auth.js';

const DEFAULTS = {
  brandName: 'GAMEGACOR',
  colors: { gold: '#ffd24d', green: '#36d96b', bg: '#1a2438' },
  toggles: { hover: true },
  menu: [
    { key: 'slots', label: 'SLOTS', show: true },
    { key: 'live', label: 'LIVE GAMES', show: true },
    { key: 'sports', label: 'SPORTS', show: true },
    { key: 'casino', label: 'CASINO', show: true },
    { key: 'lotre', label: 'LOTRE', show: true },
    { key: 'arcade', label: 'E-GAMES', show: true },
    { key: 'fish', label: 'TEMBAK IKAN', show: true },
    { key: 'promo', label: 'PROMOSI', show: true },
    { key: 'refer', label: 'REFERRAL', show: true },
    { key: 'rtp', label: 'RTP LIVE', show: true },
  ],
  games: {
    calavera: { name: 'CALAVERA RICHES', meta: '1024 Ways · RTP 96.5%', img: '/assets/img/CalaveraRiches.png', badgeText: 'HOT', badgeShow: false, badgeColor: '#ff6a55' },
    knight: { name: 'KNIGHT KINGDOM', meta: '5×3 Slot · Free Spins · Jackpot', img: '/assets/img/KnightKingdom.png', badgeText: 'NEW', badgeShow: false, badgeColor: '#6fdc92' },
  },
};

function deepMerge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = { ...base };
    if (over && typeof over === 'object') {
      for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
    }
    return out;
  }
  return over === undefined ? base : over;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');
  const { data } = await supabase.from('settings').select('value').eq('key', 'lobby_theme').maybeSingle();
  const saved = (data && data.value) || {};
  return jsonOk(res, deepMerge(DEFAULTS, saved));
}
