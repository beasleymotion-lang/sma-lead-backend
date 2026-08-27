const express = require('express');
const propertiesDb = require('../lib/properties-db');
const { SITE_URL, propertyUrl } = require('../lib/seo');
const router = express.Router();

const xml = value => String(value).replace(/[<>&'\"]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', "'":'&apos;', '\"':'&quot;' })[c]);
const imageUrl = value => { try { return new URL(value, SITE_URL).href; } catch { return ''; } };

router.get('/robots.txt', (req, res) => {
  res.set('Cache-Control','public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /health\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const properties = await propertiesDb.listProperties({ sort: 'newest' });
    const staticPaths = [
      '/',
      '/san-miguel-de-allende-real-estate',
      '/homes-for-sale-san-miguel-de-allende',
      '/homes-for-rent-san-miguel-de-allende',
      '/luxury-real-estate-san-miguel-de-allende',
      '/centro-san-miguel-de-allende-real-estate',
      '/san-antonio-san-miguel-de-allende-real-estate',
      '/guadiana-san-miguel-de-allende-real-estate',
      '/buying-a-home-in-san-miguel-de-allende',
      '/moving-to-san-miguel-de-allende',
      '/neighborhoods',
      '/neighborhoods/guadalupe',
      '/neighborhoods/la-lejona',
      '/neighborhoods/los-senderos',
      '/neighborhoods/malanquin',
      '/neighborhoods/ojo-de-agua',
    ].filter((path, index, paths) => paths.indexOf(path) === index);

    const pages = staticPaths.map(path => ({
      loc:`${SITE_URL}${path}`,
      priority:path === '/' ? '1.0' : path.startsWith('/properties/') ? '0.7' : path.startsWith('/neighborhoods/') ? '0.8' : '0.9'
    })).concat(properties.filter(p => !p.archived && ['for_sale','for_rent'].includes(p.status)).map(p => ({
      loc:propertyUrl(p.slug),
      lastmod:(p.updated_at || p.created_at || '').slice(0,10),
      priority:p.featured ? '0.9' : '0.7',
      images:(p.images || []).map(i => imageUrl(i.url)).filter(Boolean).slice(0,20)
    })));

    const items = pages.map(p => `  <url>\n    <loc>${xml(p.loc)}</loc>\n${p.lastmod ? `    <lastmod>${xml(p.lastmod)}</lastmod>\n` : ''}${p.images?.length ? p.images.map(url => `    <image:image><image:loc>${xml(url)}</image:loc></image:image>\n`).join('') : ''}    <priority>${p.priority}</priority>\n  </url>`).join('\n');
    res.set('Cache-Control','public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${items}\n</urlset>`);
  } catch (error) { next(error); }
});

module.exports = router;
