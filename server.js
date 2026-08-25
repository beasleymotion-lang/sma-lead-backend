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
const homeTitle = 'Find Your Place in San Miguel de Allende | WithBeasley';
const homeDescription = 'Find your place in San Miguel de Allende with WithBeasley. Explore distinctive homes, neighborhoods, and property opportunities with personal local guidance.';
const homeMetadata = `<link rel="canonical" href="${SITE_URL}/"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"><meta name="author" content="Blaze Beasley"><meta property="og:type" content="website"><meta property="og:url" content="${SITE_URL}/"><meta property="og:site_name" content="WithBeasley"><meta property="og:title" content="${homeTitle}"><meta property="og:description" content="${homeDescription}"><meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${homeTitle}"><meta name="twitter:description" content="${homeDescription}"><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'WebSite',name:'WithBeasley',url:SITE_URL+'/',description:'San Miguel de Allende real estate, homes, properties and relocation guidance.',inLanguage:'en-US',publisher:{'@type':'Person',name:'Blaze Beasley',url:SITE_URL+'/'}}).replace(/</g,'\\u003c')}</script><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'RealEstateAgent',name:'Blaze Beasley Real Estate',url:SITE_URL+'/',description:'Independent real estate advisor serving buyers, sellers, renters, and relocating clients in San Miguel de Allende, Guanajuato, Mexico.',areaServed:{'@type':'City',name:'San Miguel de Allende',containedInPlace:{'@type':'State','name':'Guanajuato'}},address:{'@type':'PostalAddress',addressLocality:'San Miguel de Allende',addressRegion:'Guanajuato',addressCountry:'MX'},founder:{'@type':'Person',name:'Blaze Beasley'}}).replace(/</g,'\\u003c')}</script>`;
const homeLinks = '<nav aria-label="San Miguel de Allende real estate guides" style="max-width:1200px;margin:0 auto 2rem;padding:0 1rem"><a href="/san-miguel-de-allende-real-estate">San Miguel Real Estate</a> · <a href="/san-miguel-de-allende-houses-for-sale">Houses for Sale</a> · <a href="/san-miguel-de-allende-rentals">Rentals</a> · <a href="/buying-a-home-in-san-miguel-de-allende">Buying a Home</a> · <a href="/centro-san-miguel-de-allende-real-estate">Centro Real Estate</a> · <a href="/buying-san-miguel-de-allende">Buying Guide</a> · <a href="/selling-san-miguel-de-allende">Selling Guide</a> · <a href="/relocating-to-san-miguel-de-allende">Relocation Guide</a> · <a href="/neighborhoods">Neighborhoods</a></nav>';

const allowedOrigins = (process.env.ALLOWED_ORIGIN || SITE_URL).split(',').map(origin => origin.trim()).filter(Boolean);
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(cors({ origin(origin, callback) { if (!origin || allowedOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin not allowed')); } }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'X-Frame-Options':'SAMEORIGIN',
    'Permissions-Policy':'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security':'max-age=31536000; includeSubDomains'
  });
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
    optimized = optimized.replace(/<h1[^>]*>\s*San Miguel de Allende\s*\*?Real Estate\*?\s*<\/h1>/i,'<h1>Own Something Extraordinary.</h1>');
    optimized = optimized.replace(/Exceptional homes, local expertise, and personal guidance for buyers who expect more\. Discover a more considered way to find property in one of Mexico's most beautiful cities\./i,'Discover exceptional homes in San Miguel de Allende, thoughtfully selected for the way you want to live. Explore distinctive properties, beautiful neighborhoods, and a more personal approach to finding your place in the city.');
    optimized = optimized.replace(/<\/body>/i,`${homeLinks}</body>`);
    res.type('html').send(optimized);
  });
});
app.get('/health',(req,res)=>res.json({ok:true}));
app.post('/api/internal/run-nurture',async(req,res)=>{const key=req.headers['x-internal-key'];if(!process.env.INTERNAL_CRON_KEY||key!==process.env.INTERNAL_CRON_KEY)return res.status(401).json({ok:false,error:'Not authorized.'});try{res.json({ok:true,...(await runNurtureBatch())});}catch(error){console.error('[internal/run-nurture] failed:',error);res.status(500).json({ok:false,error:'Internal nurture error.'});}});
app.use((req,res)=>{res.set('X-Robots-Tag','noindex, follow');res.status(404).type('text/html').send('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page Not Found | WithBeasley</title></head><body><main><h1>Page not found</h1><p><a href="/">Return to WithBeasley</a></p></main></body></html>');});
app.use((error,req,res,next)=>{console.error('[server] Unhandled error:',error);res.status(500).json({ok:false,error:'Internal server error.'});});
app.listen(PORT,()=>console.log(`SMA lead backend listening on port ${PORT}`));