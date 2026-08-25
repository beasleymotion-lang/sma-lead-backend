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
const testimonialsSection = `<section id="client-stories" aria-labelledby="client-stories-title" style="max-width:1200px;margin:5rem auto;padding:0 1.25rem"><div style="text-align:center;margin-bottom:2.5rem"><p style="letter-spacing:.12em;text-transform:uppercase;font-size:.78rem">Client Stories</p><h2 id="client-stories-title">Trusted by clients from around the world</h2><p>Real experiences from buyers, sellers, investors, and relocating clients who worked with Blaze.</p></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.25rem"><article><h3>Smooth Cross-Border Purchase</h3><p>“Moving to Mexico felt daunting until we met Blaze. He guided us through every step of the notary, bank trust, and closing process with absolute precision. We bought our home in Centro completely stress-free.”</p><strong>David &amp; Sarah M. · Austin, TX</strong><small>International Buyer Success</small></article><article><h3>Record Closing in Guadiana</h3><p>“Blaze’s marketing presentation and photography set our property apart immediately. We received two competitive offers above asking price within three weeks. His local network in San Miguel is unmatched.”</p><strong>Elena V. · San Miguel de Allende</strong><small>Seller Review</small></article><article><h3>Discreet and Professional</h3><p>“We requested an off-market sale for our historic property, and Blaze handled it with total discretion. He matched us with a vetted international buyer without us ever having to list publicly.”</p><strong>Marcus &amp; Claire T. · London, UK</strong><small>Seller Review</small></article><article><h3>Expert Local Knowledge</h3><p>“Blaze doesn't just show you houses; he helps you understand the nuance of every street and neighborhood in San Miguel. His patience and advice kept us from making a costly mistake.”</p><strong>Robert L. · Chicago, IL</strong><small>Buyer Review</small></article><article><h3>Uncompromising Integrity</h3><p>“What sets Blaze apart is his honesty. He pointed out structural and location considerations we would have completely overlooked. You truly feel like you have an advocate in your corner.”</p><strong>Patricia K. · Vancouver, BC</strong><small>Buyer Review</small></article><article><h3>The Ultimate San Miguel Guide</h3><p>“Beyond finding us our dream home in Los Frailes, Blaze connected us with trusted architects, legal counsel, and property managers. His advisory service goes far beyond the transaction.”</p><strong>Michael &amp; Jennifer P. · Denver, CO</strong><small>Relocation &amp; Advisory</small></article><article><h3>Responsive &amp; Attentive</h3><p>“Every phone call, text, and email was answered almost instantly. Blaze made us feel like his only clients throughout the entire search.”</p><strong>Greg &amp; Linda S. · San Francisco, CA</strong><small>Relocation &amp; Advisory</small></article><article><h3>Sharp Market Insight</h3><p>“Blaze has a deep understanding of rental yields and valuation trends across San Miguel. He identified an undervalued property in San Antonio that has turned into an exceptional investment.”</p><strong>Carlos M. · Mexico City</strong><small>Investor Review</small></article><article><h3>Seamless From A to Z</h3><p>“As a foreign investor, having a trusted point of contact on the ground is essential. Blaze executed our acquisition seamlessly while we were abroad.”</p><strong>Henrik &amp; Anette B. · Stockholm, Sweden</strong><small>Investor Review</small></article><article><h3>A Master Negotiator</h3><p>“When negotiations got complex regarding property repairs and closing terms, Blaze stayed calm, strategic, and secured us a fantastic outcome.”</p><strong>Samantha R. · New York, NY</strong><small>Investor Review</small></article></div></section>`;

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
    optimized = optimized.replace(/<\/body>/i,`${testimonialsSection}${homeLinks}</body>`);
    res.type('html').send(optimized);
  });
});
app.get('/health',(req,res)=>res.json({ok:true}));
app.post('/api/internal/run-nurture',async(req,res)=>{const key=req.headers['x-internal-key'];if(!process.env.INTERNAL_CRON_KEY||key!==process.env.INTERNAL_CRON_KEY)return res.status(401).json({ok:false,error:'Not authorized.'});try{res.json({ok:true,...(await runNurtureBatch())});}catch(error){console.error('[internal/run-nurture] failed:',error);res.status(500).json({ok:false,error:'Internal nurture error.'});}});
app.use((req,res)=>{res.set('X-Robots-Tag','noindex, follow');res.status(404).type('text/html').send('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,follow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page Not Found | WithBeasley</title></head><body><main><h1>Page not found</h1><p><a href="/">Return to WithBeasley</a></p></main></body></html>');});
app.use((error,req,res,next)=>{console.error('[server] Unhandled error:',error);res.status(500).json({ok:false,error:'Internal server error.'});});
app.listen(PORT,()=>console.log(`SMA lead backend listening on port ${PORT}`));