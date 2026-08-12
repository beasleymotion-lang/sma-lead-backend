// routes/sitemap.js
const express = require('express');
const propertiesDb = require('../lib/properties-db');
const { propertyUrl } = require('../lib/seo');

const router = express.Router();
const SITE_URL = process.env.SITE_URL || 'https://example.com';

router.get('/sitemap.xml', (req, res) => {
  const properties = propertiesDb.listProperties({ sort: 'newest' });
  const staticUrls = [
    { loc: SITE_URL, priority: '1.0' },
    { loc: `${SITE_URL}/#listings`, priority: '0.9' },
    { loc: `${SITE_URL}/#neighborhoods`, priority: '0.8' },
    { loc: `${SITE_URL}/#contact`, priority: '0.7' },
  ];
  const propertyUrls = properties.map((p) => ({
    loc: propertyUrl(p.slug),
    lastmod: (p.updated_at || p.created_at || '').slice(0, 10),
    priority: p.featured ? '0.9' : '0.7',
  }));

  const urlXml = (u) => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...propertyUrls].map(urlXml).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

module.exports = router;
