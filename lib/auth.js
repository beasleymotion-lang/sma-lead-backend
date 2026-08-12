// lib/auth.js
//
// Minimal admin auth using only Node's built-in crypto — no external
// dependency (no jsonwebtoken) since this environment can't npm install
// to verify one. Sessions are held in memory, which is fine for a single
// always-on server process but WILL reset on restart/redeploy and won't
// work across multiple server instances. For real production use with
// more than one admin or a serverless/multi-instance deploy, swap this
// for a real session store (Redis) or a proper JWT library — the login
// route and requireAuth middleware are the only two places that would
// need to change.
//
// IMPORTANT: set a strong ADMIN_PASSWORD in .env before deploying. The
// default below is only for local testing and is intentionally weak.

const crypto = require('crypto');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-now';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

const sessions = new Map(); // token -> expiresAt

function login(password) {
  if (password !== ADMIN_PASSWORD) return null;
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function logout(token) {
  sessions.delete(token);
}

function isValid(token) {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) { sessions.delete(token); return false; }
  return true;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!isValid(token)) {
    return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in again.' });
  }
  next();
}

// Periodically clear expired sessions so the Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (now > expiresAt) sessions.delete(token);
  }
}, 60 * 60 * 1000).unref();

module.exports = { login, logout, isValid, requireAuth };
