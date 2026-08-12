// routes/admin-auth.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const auth = require('../lib/auth');

const router = express.Router();

// Deliberately strict: login attempts are the highest-value target for
// brute-forcing given this uses a single shared password (see lib/auth.js).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts. Please try again later.' },
});

router.post('/admin/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  const token = auth.login(password || '');
  if (!token) return res.status(401).json({ ok: false, error: 'Incorrect password.' });
  res.json({ ok: true, token });
});

router.post('/admin/logout', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  auth.logout(token);
  res.json({ ok: true });
});

module.exports = router;
