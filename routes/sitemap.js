const express = require('express');
const propertiesDb = require('../lib/properties-db');
const { SITE_URL, propertyUrl } = require('../lib/seo');
const router = express.Router();
const xml = value => String(value).replace(/[<>&'"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '"':'&quot;' })[c]);

router.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nDisallow: /api/internal\nSitemap: ${SITE_URL}/sitemap.xml\n`));
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const properties = await propertiesDb.listProperties({ sort: 'newest' });
    const pages = [SITE_URL, `${SITE_URL}/buying-san-miguel-de-allende`, `${SITE_URL}/selling-san-miguel-de-allende`, `${SITE_URL}/relocating-to-san-miguel-de-allende`, `${SITE_URL}/neighborhoods`]
      .map(loc => ({ loc, priority: loc === SITE_URL ? '1.0' : '0.8' }))
      .concat(properties.filter(p => !p.archived && ['for_sale', 'for_rent'].includes(p.status)).map(p => ({ loc: propertyUrl(p.slug), lastmod: (p.updated_at || p.created_at || '').slice(0, 10), priority: p.featured ? '0.9' : '0.7' })));
    const items = pages.map(p => `  <url>\n    <loc>${xml(p.loc)}</loc>\n${p.lastmod ? `    <lastmod>${xml(p.lastmod)}</lastmod>\n` : ''}    <priority>${p.priority}</priority>\n  </url>`).join('\n');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>`);
  } catch (error) { next(error); }
});
module.exports = router;
