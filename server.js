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
const seoGrowthRoute = require('./routes/seo-growth');
const adminAuthRoute = require('./routes/admin-auth');
const { runNurtureBatch } = require('./lib/nurture-runner');
const { SITE_URL } = require('./lib/seo');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_BODY_LIMIT = process.env.ADMIN_BODY_LIMIT || '25mb';
const homeFile = path.join(__dirname, 'public', 'index.html');
const homeTitle = 'San Miguel de Allende Real Estate | Homes for Sale & Rent | Blaze Beasley';
const homeDescription = 'Explore San Miguel de Allende real estate, homes for sale and rent, neighborhoods, and relocation resources with Blaze Beasley.';
const homeMetadata = '<link rel="canonical" href="https://withbeasley.com/"><meta name="robots" content="index,follow,max-image-preview:large"><meta property="og:url" content="https://withbeasley.com/"><meta property="og:site_name" content="Blaze Beasley Real Estate"><meta property="og:title" content="San Miguel de Allende Real Estate | Homes for Sale & Rent | Blaze Beasley"><meta property="og:description" content="Explore San Miguel de Allende real estate, homes for sale and rent, neighborhoods, and relocation resources with Blaze Beasley."><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="San Miguel de Allende Real Estate | Homes for Sale & Rent | Blaze Beasley"><meta name="twitter:description" content="Explore San Miguel de Allende real estate, homes for sale and rent, neighborhoods, and relocation resources with Blaze Beasley."><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Blaze Beasley Real Estate","url":"https://withbeasley.com/","description":"San Miguel de Allende real estate, homes, properties and relocation guidance.","inLanguage":"en-US"}</script><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Blaze Beasley Real Estate","url":"https://withbeasley.com/"}</script>';
const homeLinks = '<nav aria-label="San Miguel de Allende real estate guides" style="max-width:1200px;margin:0 auto 2rem;padding:0 1rem"><a href="/san-miguel-de-allende-real-estate">San Miguel Real Estate</a> · <a href="/san-miguel-de-allende-houses-for-sale">Houses for Sale</a> · <a href="/san-miguel-de-allende-rentals">Rentals</a> · <a href="/buying-a-home-in-san-miguel-de-allende">Buying a Home</a> · <a href="/centro-san-miguel-de-allende-real-estate">Centro Real Estate</a> · <a href="/buying-san-miguel-de-allende">Buying Guide</a> · <a href="/selling-san-miguel-de-allende">Selling Guide</a> · <a href="/relocating-to-san-miguel-de-allende">Relocation Guide</a> · <a href="/neighborhoods">Neighborhoods</a></nav>';

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
app.use('/', seoGrowthRoute);

app.get('/', (req, res, next) => {
  fs.readFile(homeFile, 'utf8', (error, html) => {
    if (error) return next(error);
    res.set('Link', `<${SITE_URL}/>; rel="canonical"`);
    let optimized = html
      .replace(/<title>[^<]*<\/title>/i, `<title>${homeTitle}</title>`)
      .replace(/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${homeDescription}">`)
      .replace(/<\/head>/i, `${homeMetadata}</head>`);
    optimized = optimized.replace(/<\/body>/i, `${homeLinks}</body>`);
    res.type('html').send(optimized);
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
