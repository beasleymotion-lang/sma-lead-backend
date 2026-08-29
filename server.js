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
const { SITE_URL, generateOgTags, generateStructuredData, generateBreadcrumbs } = require('./lib/seo');
const propertiesDb = require('./lib/properties-db');

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_BODY_LIMIT = process.env.ADMIN_BODY_LIMIT || '25mb';
const homeFile = path.join(__dirname, 'public', 'index.html');
const homeTitle = 'Find Your Place in San Miguel de Allende | WithBeasley';
const homeDescription = 'Find your place in San Miguel de Allende with WithBeasley. Explore distinctive homes, neighborhoods, and property opportunities with personal local guidance.';
const homeMetadata = `<link rel="canonical" href="${SITE_URL}/"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><meta name="author" content="Blaze Beasley"><meta property="og:type" content="website"><meta property="og:url" content="${SITE_URL}/"><meta property="og:site_name" content="WithBeasley"><meta property="og:title" content="${homeTitle}"><meta property="og:description" content="${homeDescription}"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${homeTitle}"><meta name="twitter:description" content="${homeDescription}"><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'WithBeasley',url:SITE_URL+'/',description:'San Miguel de Allende real estate, homes, properties and relocation guidance.',inLanguage:'en-US',publisher:{'@type':'Person',name:'Blaze Beasley',url:SITE_URL+'/'}}).replace(/</g,'\\u003c')}</script><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Person',name:'Blaze Beasley',url:SITE_URL+'/',description:'Independent property advisor and local guide serving clients exploring homes, rentals, and property opportunities in San Miguel de Allende, Guanajuato, Mexico.',jobTitle:'Independent Property Advisor',homeLocation:{'@type':'City',name:'San Miguel de Allende',containedInPlace:{'@type':'State',name:'Guanajuato'}}}).replace(/</g,'\\u003c')}</script>`;
const homeLinks = '<nav aria-label="San Miguel de Allende real estate guides" style="max-width:1200px;margin:0 auto 2rem;padding:0 1rem"><a href="/san-miguel-de-allende-real-estate">San Miguel Real Estate</a> · <a href="/homes-for-sale-san-miguel-de-allende">Homes for Sale</a> · <a href="/homes-for-rent-san-miguel-de-allende">Homes for Rent</a> · <a href="/buying-a-home-in-san-miguel-de-allende">Buying a Home</a> · <a href="/moving-to-san-miguel-de-allende">Moving Guide</a> · <a href="/neighborhoods">Neighborhoods</a></nav>';
const testimonialsSection = '<section id="property-guides" aria-labelledby="property-guides-title" style="max-width:1200px;margin:5rem auto;padding:0 1.25rem"><div style="text-align:center"><p style="letter-spacing:.12em;text-transform:uppercase;font-size:.78rem">Explore San Miguel</p><h2 id="property-guides-title">Start with useful local guides</h2><p>Explore neighborhoods, homes for sale, rentals, and practical property information to help organize your search.</p></div></section>';
const mapSection = '<section id="explore-map" aria-labelledby="explore-map-title" style="max-width:1200px;margin:4rem auto 5rem;padding:0 1.25rem"><div style="background:#17221f;color:#f7f3ec;border-radius:24px;padding:clamp(2rem,5vw,4.5rem);display:grid;grid-template-columns:minmax(0,1.05fr) minmax(280px,.95fr);gap:2.5rem;align-items:center"><div><p style="letter-spacing:.14em;text-transform:uppercase;font-size:.75rem;color:#d8b57c;margin:0 0 1rem">Interactive local guide</p><h2 id="explore-map-title" style="font-family:Georgia,serif;font-size:clamp(2.2rem,4vw,4rem);line-height:1;margin:0 0 1rem">Explore San Miguel before you choose where to live.</h2><p style="font-size:1.05rem;line-height:1.65;color:#d8ddd9;max-width:620px">See neighborhood boundaries, cafés, restaurants, hotels, landmarks, and the areas that make San Miguel de Allende unique.</p><a href="/map" style="display:inline-block;margin-top:1.25rem;background:#f7f3ec;color:#17221f;padding:.9rem 1.25rem;border-radius:999px;text-decoration:none;font-weight:700">Explore the interactive map →</a></div><a href="/map" aria-label="Open the San Miguel de Allende interactive map" style="display:block;min-height:300px;border-radius:16px;overflow:hidden;background:#d9d2c5;text-decoration:none;color:#17221f"><iframe src="/map" title="San Miguel de Allende interactive map preview" loading="lazy" style="width:100%;height:360px;border:0;pointer-events:none" tabindex="-1"></iframe></a></div><style>@media(max-width:760px){#explore-map>div{grid-template-columns:1fr!important}#explore-map iframe{height:260px!important}}</style></section>';

const allowedOrigins = (process.env.ALLOWED_ORIGIN || SITE_URL).split(',').map(origin => origin.trim()).filter(Boolean);
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed')); } }));
app.use((req, res, next) => {
  res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'SAMEORIGIN','Permissions-Policy':'geolocation=(), microphone=(), camera=()','Strict-Transport-Security':'max-age=31536000; includeSubDomains'});
  if (req.path.startsWith('/api/') || req.path === '/admin' || req.path.startsWith('/admin/')) res.set('X-Robots-Tag','noindex, nofollow');
  next();
});
app.use('/api/guide-request', express.json({ limit:'10kb' }));
app.use('/api/property-inquiry', express.json({ limit:'10kb' }));
app.use('/api/lead-request', express.json({ limit:'20kb' }));
app.use('/api/admin', express.json({ limit:ADMIN_BODY_LIMIT }));
app.use('/guides', express.static(path.join(__dirname,'public','guides'), { maxAge:'7d' }));
app.use('/uploads', express.static(path.join(__dirname,'public','uploads'), { maxAge:'7d', immutable:true }));
app.use('/admin', express.static(path.join(__dirname,'admin')));
app.use('/api', guideRequestRoute);
app.use('/api', propertiesRoute);
app.use('/api', leadsRoute);
app.use('/api', adminAuthRoute);
app.use('/', sitemapRoute);

// Consolidate duplicate SEO URLs so Google receives one clear canonical page per search intent.
const seoRedirects = {
  '/san-miguel-de-allende-houses-for-sale': '/homes-for-sale-san-miguel-de-allende',
  '/san-miguel-de-allende-rentals': '/homes-for-rent-san-miguel-de-allende',
  '/buying-san-miguel-de-allende': '/buying-a-home-in-san-miguel-de-allende',
  '/relocating-to-san-miguel-de-allende': '/moving-to-san-miguel-de-allende'
};
app.use((req, res, next) => {
  const target = seoRedirects[req.path];
  if (target) return res.redirect(301, target);
  next();
});
app.use('/', seoPagesRoute);
app.use('/', seoGrowthRoute);

app.get('/', (req, res, next) => {
  fs.readFile(homeFile,'utf8',(error,html)=>{
    if (error) return next(error);
    res.set({'Link': `<${SITE_URL}/>; rel="canonical"`, 'Cache-Control':'public, max-age=300, s-maxage=300, stale-while-revalidate=86400'});
    let optimized = html
      .replace(/<title>[^<]*<\/title>/i,`<title>${homeTitle}</title>`)
      .replace(/<meta\s+name=["']description["'][^>]*>/i,`<meta name="description" content="${homeDescription}">`)
      .replace(/<meta\s+name=["']robots["'][^>]*>/i,`<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">`)
      .replace(/<\/head>/i,`${homeMetadata}</head>`);
    optimized = optimized.replace(/\+1 \(555\) 123-4567/g,'Contact through the consultation form').replace(/blaze@sanmiguelrealty\.example/g,'Use the consultation form to get in touch').replace(/Property Photo Placeholder/g,'Property photo').replace(/Placeholder — photography of [^<]+/g,'');
    optimized = optimized.replace(/I know buying a home in another country can feel exciting, but it can also feel overwhelming\. My goal is to make that journey as simple and enjoyable as possible by offering honest advice, local knowledge, and guidance you can trust from our first conversation to closing day\./i,'I know searching for a home in another country can feel exciting and overwhelming. My goal is to help you understand the local options, neighborhoods, and practical next steps while you make decisions that are right for you.');
    optimized = optimized.replace(/one of my favorite parts of this job is helping people discover which one feels like home to them\./i,'one of my favorite parts of this work is helping people explore which areas feel like the best fit for their lifestyle.');
    optimized = optimized.replace(/Focused on a smooth, personal buying & selling experience/i,'Focused on clear, personal property-search support');
    optimized = optimized.replace(/Buying or selling in a foreign country requires more than a listing portal — it requires a guide who knows every street, every notario, and every detail that matters\./i,'Buying or selling property across borders can involve many moving parts. A thoughtful search starts with local context, accurate property information, and the right qualified professionals when specialized advice is needed.');
    optimized = optimized.replace(/every neighborhood's rhythm, restrictions, and real value/i,'neighborhood character, daily rhythm, and the differences between local areas');
    optimized = optimized.replace(/my direct cell — not a call center/i,'direct communication and a more personal point of contact');
    optimized = optimized.replace(/for every listing I represent/i,'for properties I am asked to help present, subject to the services and permissions involved');
    optimized = optimized.replace(/Rental yield, appreciation trends, and market timing guidance for buyers thinking beyond a first home\./i,'Property-focused research and neighborhood comparisons for buyers evaluating different options.');
    optimized = optimized.replace(/Calm, informed negotiation that protects your interests from offer to closing\./i,'Clear communication and support as you evaluate next steps with the appropriate professionals involved.');
    optimized = optimized.replace(/from our first conversation to closing day/gi,'through your property search and next steps');
    optimized = optimized.replace(/Independently owned and operated · San Miguel de Allende, Gto\., Mexico/i,'Independent property-search and marketing platform · San Miguel de Allende, Gto., Mexico');
    optimized = optimized.replace(/<h1[^>]*>\s*San Miguel de Allende\s*\*?Real Estate\*?\s*<\/h1>/i,'<h1>Own Something Extraordinary.</h1>');
    optimized = optimized.replace(/Exceptional homes, local expertise, and personal guidance for buyers who expect more\. Discover a more considered way to find property in one of Mexico's most beautiful cities\./i,'Discover exceptional homes in San Miguel de Allende, thoughtfully selected for the way you want to live. Explore distinctive properties, beautiful neighborhoods, and a more personal approach to finding your place in the city.');
    optimized = optimized.replace(/<\/body>/i,`${testimonialsSection}${mapSection}${homeLinks}</body>`);
    res.type('html').send(optimized);
  });
});
app.get('/map', (req, res, next) => {
  const mapFile = path.join(__dirname, 'public', 'map.html');
  res.set({'Link': `<${SITE_URL}/map>; rel="canonical"`, 'Cache-Control':'public, max-age=300, s-maxage=300'});
  res.sendFile(mapFile, err => { if (err) next(err); });
});

app.get('/properties/:slug', async (req, res, next) => {
  try {
    const property = await propertiesDb.getPropertyBySlug(req.params.slug);
    if (!property || property.archived) return next();
    const title = property.seo_title || property.title || 'Property in San Miguel de Allende | WithBeasley';
    const description = property.meta_description || '';
    const og = generateOgTags(property);
    const structuredData = generateStructuredData(property);
    const breadcrumbs = {
      '@context':'https://schema.org',
      '@type':'BreadcrumbList',
      itemListElement: generateBreadcrumbs(property).map((item, index) => ({
        '@type':'ListItem', position:index + 1, name:item.name, item:item.url
      }))
    };
    const image = og['og:image'] || '';
    const propertyFacts = [
      property.property_type,
      property.bedrooms ? `${property.bedrooms} bedrooms` : '',
      property.bathrooms ? `${property.bathrooms} bathrooms` : '',
      property.neighborhood
    ].filter(Boolean).join(' · ');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description.replace(/"/g,'&quot;')}"><link rel="canonical" href="${SITE_URL}/properties/${encodeURIComponent(property.slug)}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><meta property="og:type" content="website"><meta property="og:url" content="${og['og:url']}"><meta property="og:site_name" content="WithBeasley"><meta property="og:title" content="${og['og:title']}"><meta property="og:description" content="${og['og:description']}">${image ? `<meta property="og:image" content="${image}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${image}">` : '<meta name="twitter:card" content="summary">'}<script type="application/ld+json">${JSON.stringify(structuredData).replace(/</g,'\\u003c')}</script><script type="application/ld+json">${JSON.stringify(breadcrumbs).replace(/</g,'\\u003c')}</script></head><body><main><p><a href="/">WithBeasley</a> · <a href="/homes-for-sale-san-miguel-de-allende">Properties</a></p><article><h1>${property.title}</h1>${propertyFacts ? `<p>${propertyFacts}</p>` : ''}${image ? `<img src="${image}" alt="${property.title}" style="max-width:100%;height:auto">` : ''}${property.short_description ? `<p>${property.short_description}</p>` : ''}${property.description ? `<section><h2>About this property</h2><p>${String(property.description).replace(/\n/g,'<br>')}</p></section>` : ''}<p><a href="/#contact">Ask about this property</a></p></article></main></body></html>`;
    res.set({'Link': `<${SITE_URL}/properties/${encodeURIComponent(property.slug)}>; rel="canonical"`, 'Cache-Control':'public, max-age=300, s-maxage=300'});
    res.type('html').send(html);
  } catch (error) { next(error); }
});

app.get('/health',(req,res)=>res.json({ok:true}));
app.post('/api/internal/run-nurture',async(req,res)=>{const key=req.headers['x-internal-key'];if(!process.env.INTERNAL_CRON_KEY||key!==process.env.INTERNAL_CRON_KEY)return res.status(401).json({ok:false,error:'Not authorized.'});try{res.json({ok:true,...(await runNurtureBatch())});}catch(error){console.error('[internal/run-nurture] failed:',error);res.status(500).json({ok:false,error:'Internal nurture error.'});}});
app.use((req,res)=>{res.set('X-Robots-Tag','noindex, follow');res.status(404).type('text/html').send('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page Not Found | WithBeasley</title></head><body><main><h1>Page not found</h1><p><a href="/">Return to WithBeasley</a></p></main></body></html>');});
app.use((error,req,res,next)=>{console.error('[server] Unhandled error:',error);res.status(500).json({ok:false,error:'Internal server error.'});});
app.listen(PORT,()=>console.log(`SMA lead backend listening on port ${PORT}`));