require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const guideRequestRoute = require('./routes/guide-request');
const propertiesRoute = require('./routes/properties');
const leadsRoute = require('./routes/leads');
const sitemapRoute = require('./routes/sitemap');
const seoPagesRoute = require('./routes/seo-pages');
const adminAuthRoute = require('./routes/admin-auth');
const { runNurtureBatch } = require('./lib/nurture-runner');
const { SITE_URL } = require('./lib/seo');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_BODY_LIMIT = process.env.ADMIN_BODY_LIMIT || '25mb';
const homeFile = path.join(__dirname, 'public', 'index.html');
const homeMetadata = '<link rel="canonical" href="https://withbeasley.com/"><meta property="og:url" content="https://withbeasley.com/"><meta property="og:site_name" content="Blaze Beasley Real Estate"><meta name="twitter:card" content="summary_large_image">';
const homeLinks = '<nav aria-label="San Miguel de Allende real estate guides" style="max-width:1200px;margin:0 auto 2rem;padding:0 1rem"><a href="/buying-san-miguel-de-allende">Buying in San Miguel de Allende</a> · <a href="/selling-san-miguel-de-allende">Selling in San Miguel de Allende</a> · <a href="/relocating-to-san-miguel-de-allende">Relocating to San Miguel de Allende</a> · <a href="/neighborhoods">Neighborhood guide</a></nav>';

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use('/api/guide-request', express.json({ limit: '10kb' }));
app.use('/api/property-inquiry', express.json({ limit: '10kb' }));
app.use('/api/lead-request', express.json({ limit: '20kb' }));
app.use('/api/admin', express.json({ limit: ADMIN_BODY_LIMIT }));
app.use('/guides', express.static(path.join(__dirname, 'public', 'guides')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/api', guideRequestRoute);
app.use('/api', propertiesRoute);
app.use('/api', leadsRoute);
app.use('/api', adminAuthRoute);
app.use('/', sitemapRoute);
app.use('/', seoPagesRoute);

app.get('/', (req, res, next) => {
  fs.readFile(homeFile, 'utf8', (error, html) => {
    if (error) return next(error);
    res.set('Link', `<${SITE_URL}/>; rel="canonical"`);
    res.type('html').send(html.replace(/<\/head>/i, `${homeMetadata}</head>`));
  });
});
app.get('/health', (req, res) => res.json({ ok: true }));
app.post('/api/internal/run-nurture', async (req, res) => {
  const key = req.headers['x-internal-key'];
  if (!process.env.INTERNAL_CRON_KEY || key !== process.env.INTERNAL_CRON_KEY) return res.status(401).json({ ok:false, error:'Not authorized.' });
  try { res.json({ ok:true, ...(await runNurtureBatch()) }); }
  catch (error) { console.error('[internal/run-nurture] failed:', error); res.status(500).json({ ok:false, error:error.message }); }
});
app.use((error, req, res, next) => { console.error('[server] Unhandled error:', error); res.status(500).json({ ok:false, error:'Internal server error.' }); });
app.listen(PORT, () => console.log(`SMA lead backend listening on port ${PORT}`));
