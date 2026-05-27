// GET /api/admin/settings — read all settings
// PATCH /api/admin/settings — body: { key, value }
// Header: X-Admin-Password
import { supabase } from '../_lib/supabase.js';
import { isAdminReq, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdminReq(req)) return jsonError(res, 401, 'Admin password required');

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) return jsonError(res, 500, error.message);
    const obj = {};
    (data || []).forEach((r) => obj[r.key] = r.value);
    return jsonOk(res, obj);
  }

  if (req.method === 'PATCH') {
    const { key, value } = req.body || {};
    if (!key) return jsonError(res, 400, 'key required');
    const { error } = await supabase.from('settings').upsert({ key, value });
    if (error) return jsonError(res, 500, error.message);
    return jsonOk(res, { ok: true });
  }

  return jsonError(res, 405, 'Method not allowed');
}
