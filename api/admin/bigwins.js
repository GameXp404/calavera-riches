// GET /api/admin/bigwins — list big win history (max 50)
// DELETE /api/admin/bigwins — clear all
import { supabase } from '../_lib/supabase.js';
import { isAdminReq, jsonError, jsonOk } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (!isAdminReq(req)) return jsonError(res, 401, 'Admin password required');

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('big_wins').select('*').order('occurred_at', { ascending: false }).limit(50);
    if (error) return jsonError(res, 500, error.message);
    return jsonOk(res, { wins: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase.from('big_wins').delete().neq('id', 0);
    if (error) return jsonError(res, 500, error.message);
    return jsonOk(res, { ok: true });
  }

  return jsonError(res, 405, 'Method not allowed');
}
