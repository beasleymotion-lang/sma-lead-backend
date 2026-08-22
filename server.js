// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const guideRequestRoute = require('./routes/guide-request');
const propertiesRoute = require('./routes/properties');
const leadsRoute = require('./routes/leads');
const sitemapRoute = require('./routes/sitemap');
const adminAuthRoute = require('./routes/admin-auth');
const { runNurtureBatch } = require('./lib/nurture-runner');

const app = express();
const PORT = process.env.PORT || 3001;

// Property/image payloads (base64 photos) are much larger than a simple lead
// form. This limit bounds a single publish/update request; for very large
// photo batches, upload in a couple of smaller batches rather than raising
// this indefinitely. A future iteration should move to real multipart
// streaming uploads (e.g. multer + S3) for better scale.
const ADMIN_BODY_LIMIT = process.env.ADMIN_BODY_LIMIT || '25mb';
const UPLOAD_DIR =
  process.env.UPLOAD_DIR ||
  path.join(__dirname, 'public', 'uploads');

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

// Body parsing: scoped per path group, NOT layered with a catch-all.
// Every POST/PUT/DELETE route in this app lives under one of these prefixes,
// so this covers all of them without any request ever passing through more
// than one json() parser.
app.use('/api/guide-request', express.json({ limit: '10kb' }));
app.use('/api/property-inquiry', express.json({ limit: '10kb' }));
app.use('/api/admin', express.json({ limit: ADMIN_BODY_LIMIT }));

// ============================================================
// STATIC FILE SERVING
// ============================================================

app.use(
  '/guides',
  express.static(path.join(__dirname, 'public', 'guides'))
);

app.use(
  '/uploads',
  express.static(path.join(__dirname, 'public', 'uploads'))
);

app.use(
  '/admin',
  express.static(path.join(__dirname, 'admin'))
);

// Serve CSS, JavaScript, images, fonts, etc. from public/
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false
  })
);

// ============================================================
// FRONTEND ROUTES
// ============================================================

// Main website homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Property browser URLs should load the frontend.
// The actual property data comes from /api/properties/:slug.
app.get('/properties/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// ============================================================
// API ROUTES
// ============================================================

app.use('/api', guideRequestRoute);
app.use('/api', propertiesRoute);
app.use('/api', leadsRoute);
app.use('/api', adminAuthRoute);

// Sitemap
app.use('/', sitemapRoute);

// ============================================================
// INTERNAL NURTURE CRON ENDPOINT
// ============================================================

app.post('/api/internal/run-nurture', async (req, res) => {
  const key = req.headers['x-internal-key'];

  if (
    !process.env.INTERNAL_CRON_KEY ||
    key !== process.env.INTERNAL_CRON_KEY
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Not authorized.'
    });
  }

  try {
    const result = await runNurtureBatch();

    res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    console.error('[internal/run-nurture] failed:', err);

    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);

  res.status(500).json({
    ok: false,
    error: 'Internal server error.'
  });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
  console.log(`SMA lead backend listening on port ${PORT}`);
});
