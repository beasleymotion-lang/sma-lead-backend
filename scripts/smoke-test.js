const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY ||= 'test-key';

const sitemapRoute = require('../routes/sitemap');
const seoPagesRoute = require('../routes/seo-pages');
const seoGrowthRoute = require('../routes/seo-growth');

const app = express();
app.use('/', sitemapRoute);
app.use('/', seoPagesRoute);
app.use('/', seoGrowthRoute);

const routes = [
  ['/robots.txt', 'Sitemap: https://withbeasley.com/sitemap.xml'],
  ['/san-miguel-de-allende-real-estate', '<link rel="canonical" href="https://withbeasley.com/san-miguel-de-allende-real-estate">'],
  ['/buying-a-home-in-san-miguel-de-allende', '<h1>Buying a Home in San Miguel de Allende</h1>'],
  ['/neighborhoods', '<h1>Explore San Miguel de Allende neighborhoods</h1>']
];

async function request(path) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fetch(`http://127.0.0.1:${port}${path}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

(async () => {
  const homeHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  assert.match(homeHtml, /<h1 class="hero-anim">San Miguel de Allende <em>Real Estate\.<\/em><\/h1>/);

  for (const [path, expected] of routes) {
    const response = await request(path);
    assert.equal(response.status, 200, `${path} should return 200`);
    const body = await response.text();
    assert.ok(body.includes(expected), `${path} should include expected SEO content`);
  }

  const robots = await request('/robots.txt');
  assert.match(await robots.text(), /Disallow: \/api\//);

  console.log(`SEO smoke tests passed for the homepage and ${routes.length} public routes.`);
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
