// JWT helpers + password hashing + admin guard.
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

const SECRET = process.env.JWT_SECRET || 'change-this-secret-in-vercel-env';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'admin123';

// 7-day session token for players
export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  try { return jwt.verify(token, SECRET); } catch (_) { return null; }
}

// Read JWT from request (Authorization: Bearer <token>)
export function getUserFromReq(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  return verifyToken(m[1]);
}

// SHA-256 password hashing (matches game-side hashPassword, future-proof)
export function hashPassword(plain) {
  return crypto.createHash('sha256').update(plain, 'utf8').digest('hex');
}

// Admin password gate — checks header X-Admin-Password against ENV var
export function isAdminReq(req) {
  const provided = req.headers['x-admin-password'];
  return provided && provided === ADMIN_PASS;
}

// Helper: validate username format (alphanumeric, dash, underscore, 1-24 chars)
export function sanitizeUsername(raw) {
  if (typeof raw !== 'string') return null;
  const clean = raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24);
  return clean || null;
}

// Common error response helper
export function jsonError(res, status, message) {
  res.status(status).json({ error: message });
}

export function jsonOk(res, data) {
  res.status(200).json(data);
}
