// POST /api/auth/register
// Body: { username, password }
// Returns: { token, user } on success, { error } on failure.
import { supabase } from '../_lib/supabase.js';
import { signToken, hashPassword, sanitizeUsername, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const { username: rawUser, password } = req.body || {};
  const username = sanitizeUsername(rawUser);
  if (!username) return jsonError(res, 400, 'Username tidak valid (1-24 karakter alphanumeric)');
  if (!password || typeof password !== 'string' || password.length < 1) {
    return jsonError(res, 400, 'Password wajib diisi');
  }

  // Check maintenance flag
  const { data: maint } = await supabase
    .from('settings').select('value').eq('key', 'maintenance').single();
  if (maint?.value === true) return jsonError(res, 503, 'Game sedang maintenance');

  // Check if username already taken
  const { data: existing } = await supabase
    .from('players').select('id').eq('username', username).maybeSingle();
  if (existing) return jsonError(res, 409, `Username "${username}" sudah terdaftar — pakai username lain atau login`);

  // Insert new player
  const passwordHash = hashPassword(password);
  const { data: player, error } = await supabase
    .from('players')
    .insert({
      username,
      password_hash: passwordHash,
      balance: 1000000,
      last_login: new Date().toISOString(),
    })
    .select('id, username, balance, bet_idx, turbo, ante_bet')
    .single();

  if (error) {
    console.error('[register] insert error:', error);
    return jsonError(res, 500, 'Gagal membuat akun: ' + error.message);
  }

  const token = signToken({ id: player.id, username: player.username });
  jsonOk(res, { token, user: player });
}
