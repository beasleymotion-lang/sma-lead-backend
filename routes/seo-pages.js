const express = require('express');
const propertiesDb = require('../lib/properties-db');
const { SITE_URL, propertyUrl, generateSeoTitle, generateMetaDescription, generateOgTags, generateStructuredData } = require('../lib/seo');
const router = express.Router();

const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

const head = ({ title, description, canonical, og = {}, noindex = false, schema }) => `<head><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta name="robots" content="${noindex ? 'noindex,follow' : 'index,follow,max-image-preview:large'}"><meta name="viewport" content="width=device-width,initial-scale=1">${Object.entries(og).map(([k,v]) => v ? `<meta ${k.startsWith('twitter:') ? 'name' : 'property'}="${escape(k)}" content="${escape(v)}">` : '').join('')}${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>` : ''}</head>`;

const page = (metadata, content) => `<!doctype html><html lang="en">${head(metadata)}<body><header><a href="/">Blaze Beasley</a><nav aria-label="Primary"><a href="/#listings">Properties</a><a href="/buying-san-miguel-de-allende">Buy</a><a href="/selling-san-miguel-de-allende">Sell</a><a href="/neighborhoods">Neighborhoods</a><a href="/relocating-to-san-miguel-de-allende">Relocate</a><a href="/#contact">Contact</a></nav></header><main>${content}</main><footer><p>Blaze Beasley · San Miguel de Allende, Guanajuato</p><a href="/#listings">Properties</a> · <a href="/buying-san-miguel-de-allende">Buying guide</a> · <a href="/selling-san-miguel-de-allende">Selling guide</a> · <a href="/relocating-to-san-miguel-de-allende">Relocation guide</a> · <a href="/neighborhoods">Neighborhood guide</a></footer></body></html>`;

router.get('/properties/:slug', async (req, res, next) => {
  try {
    const p = await propertiesDb.getPropertyBySlug(req.params.slug);
    const canonical = `${SITE_URL}/properties/${encodeURIComponent(req.params.slug)}`;
    if (!p || p.archived) return res.status(404).send(page({ title:'Property Not Found | Blaze Beasley', description:'Browse San Miguel de Allende real estate with Blaze Beasley.', canonical, noindex:true }, '<article><h1>Property not found</h1><p><a href="/#listings">Browse available San Miguel de Allende properties</a></p></article>'));
    const indexable = ['for_sale', 'for_rent'].includes(p.status);
    const images = (p.images || []).filter(i => i.url).slice(0, 20).map((i,n) => `<img src="${escape(i.url)}" alt="${escape(i.alt || `${p.title} in San Miguel de Allende photo ${n + 1}`)}" loading="${n ? 'lazy' : 'eager'}">`).join('');
    const facts = [p.property_type, p.neighborhood, p.bedrooms && `${p.bedrooms} bedrooms`, p.bathrooms && `${p.bathrooms} bathrooms`].filter(Boolean).map(escape).join(' · ');
    const schema = indexable ? [
      generateStructuredData(p),
      { '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[
        { '@type':'ListItem', position:1, name:'Home', item:SITE_URL },
        { '@type':'ListItem', position:2, name:'Properties', item:`${SITE_URL}/#listings` },
        ...(p.neighborhood ? [{ '@type':'ListItem', position:3, name:p.neighborhood, item:`${SITE_URL}/neighborhoods` }] : []),
        { '@type':'ListItem', position:p.neighborhood ? 4 : 3, name:p.title, item:propertyUrl(p.slug) }
      ]}
    ] : undefined;
    const content = `<article><p><a href="/#listings">San Miguel de Allende properties</a>${p.neighborhood ? ` / <a href="/neighborhoods">${escape(p.neighborhood)}</a>` : ''}</p><h1>${escape(p.title)}</h1>${facts ? `<p>${facts}</p>` : ''}${p.price ? `<p><strong>${escape(p.currency === 'MXN' ? 'MXN $' : '$')}${escape(Number(p.price).toLocaleString('en-US'))}</strong></p>` : ''}${images ? `<section aria-label="Property photos">${images}</section>` : ''}${p.highlights?.length ? `<section><h2>Property highlights</h2><ul>${p.highlights.map(x => `<li>${escape(x)}</li>`).join('')}</ul></section>` : ''}${p.luxury_description || p.short_description ? `<section><h2>About this property</h2><p>${escape(p.luxury_description || p.short_description)}</p></section>` : ''}<section><h2>San Miguel de Allende real estate</h2><p>Explore more available homes or request a private consultation about this property, its neighborhood, and your search goals.</p><p><a href="/#listings">Browse available properties</a> · <a href="/buying-san-miguel-de-allende">Buying guide</a> · <a href="/#contact">Request a consultation</a></p></section></article>`;
    res.send(page({ title:p.seo_title || generateSeoTitle(p), description:p.meta_description || generateMetaDescription(p), canonical:propertyUrl(p.slug), og:generateOgTags(p), noindex:!indexable, schema }, content));
  } catch (error) { next(error); }
});

const guides = {
  '/buying-san-miguel-de-allende': {
    title:'Buying Real Estate in San Miguel de Allende | Blaze Beasley',
    description:'A practical guide to buying real estate in San Miguel de Allende, including neighborhoods, property searches, due diligence, and the local buying process.',
    heading:'Buying Real Estate in San Miguel de Allende',
    body:'<p>Buying a home in San Miguel de Allende starts with understanding how you want to live. Compare neighborhoods, property types, budgets, and priorities before narrowing the search.</p><h2>Start with the right neighborhood</h2><p>San Miguel has distinct neighborhoods and communities, each with its own setting and housing options. Explore several areas before deciding where you want to focus.</p><h2>Compare homes in context</h2><p>Look beyond the headline price. Consider condition, location, construction, outdoor space, parking, services, and the practical details that affect how a property fits your plans.</p><h2>Plan professional due diligence</h2><p>For legal, tax, financing, title, residency, or other regulated matters, use appropriately qualified professionals. A real estate search is only one part of a successful purchase.</p><h2>Make the search personal</h2><p>Share your preferred areas, property type, budget, timing, and must-have features so the search can focus on homes that genuinely fit.</p>',
    faqs:[['What should I look for when buying in San Miguel de Allende?','Start with neighborhood, property condition, ownership and documentation questions, total costs, and how the home fits your intended use.'],['Can foreigners buy property in San Miguel de Allende?','Foreign buyers should obtain current legal and tax advice from qualified Mexican professionals about the ownership structure and transaction.'],['How do I start a San Miguel property search?','Begin with your budget, preferred neighborhoods, property type, timing, and must-have features, then compare available homes against those criteria.']]
  },
  '/selling-san-miguel-de-allende': {
    title:'Sell a Home in San Miguel de Allende | Blaze Beasley',
    description:'A practical San Miguel de Allende home selling guide covering preparation, pricing, presentation, marketing, and planning your next move.',
    heading:'Sell a Home in San Miguel de Allende',
    body:'<p>Preparing to sell begins with a clear understanding of your home, timing, presentation, and the buyers most likely to value the property.</p><h2>Prepare the property</h2><p>Identify the improvements, repairs, photography, staging, and documentation that can make the home easier for prospective buyers to evaluate.</p><h2>Build a pricing strategy</h2><p>Pricing should reflect the property, its location, condition, competition, and the goals of the seller rather than relying on a generic formula.</p><h2>Market the home clearly</h2><p>Strong photography, accurate property details, compelling descriptions, and targeted distribution help qualified buyers understand the opportunity.</p><h2>Plan the transaction</h2><p>Coordinate the practical steps early and use qualified legal, tax, and other professionals for matters outside real estate marketing and representation.</p>',
    faqs:[['How should I prepare my San Miguel home for sale?','Start with condition, presentation, photography, accurate property information, and a realistic pricing strategy.'],['How is a San Miguel property marketing plan built?','The plan should combine strong presentation with accurate information and targeted exposure to buyers who are looking for the type of property being offered.']]
  },
  '/relocating-to-san-miguel-de-allende': {
    title:'Relocating to San Miguel de Allende | Blaze Beasley',
    description:'Explore San Miguel de Allende neighborhoods, homes, rentals, and practical next steps for planning a thoughtful relocation to Guanajuato.',
    heading:'Relocating to San Miguel de Allende',
    body:'<p>Relocating is about more than choosing a house. The right move starts with understanding neighborhoods, daily routines, housing options, timing, and the practical questions that matter to your household.</p><h2>Explore before committing</h2><p>Spend time in different parts of San Miguel de Allende and compare the pace, setting, housing stock, and amenities that matter to you.</p><h2>Decide whether to rent or buy first</h2><p>Some people prefer to rent while learning the city; others already know what they want to buy. Your timeline, budget, and certainty about location should guide the decision.</p><h2>Build your professional team</h2><p>For immigration, residency, banking, healthcare, taxes, and legal matters, consult the relevant qualified professionals. Real estate is one piece of a larger relocation plan.</p><h2>Make housing part of the lifestyle plan</h2><p>Think about work, transportation, outdoor space, family needs, guests, and the kind of daily life you want before narrowing your property search.</p>',
    faqs:[['Is San Miguel de Allende a good place to relocate?','It depends on your lifestyle, budget, climate preferences, work situation, and desired community. Exploring in person is the best way to evaluate the fit.'],['Where should I live in San Miguel de Allende?','Start by comparing neighborhoods and communities against your priorities for location, housing, pace, views, outdoor space, and access to the places you use most.']]
  },
  '/neighborhoods': {
    title:'San Miguel de Allende Neighborhood Guide | Blaze Beasley',
    description:'Explore San Miguel de Allende neighborhoods and communities to find the setting, homes, and lifestyle that fit your real estate search.',
    heading:'San Miguel de Allende Neighborhood Guide',
    body:'<p>Every part of San Miguel de Allende has its own character. Use the neighborhood guide to begin narrowing your search, then explore properties in person to understand the setting for yourself.</p><h2>Compare neighborhoods, not just houses</h2><p>Think about location, pace, architecture, outdoor space, views, access to the historic center, and the type of home you want.</p><p><a href="/neighborhoods/guadalupe">Guadalupe</a> · <a href="/neighborhoods/la-lejona">La Lejona</a> · <a href="/neighborhoods/los-senderos">Los Senderos</a> · <a href="/neighborhoods/malanquin">Malanquín</a> · <a href="/neighborhoods/ojo-de-agua">Ojo de Agua</a> · <a href="/neighborhoods/zirandaro">Zirándaro</a></p><p><a href="/#listings">Browse available properties</a> or <a href="/#contact">talk with Blaze about your search</a>.</p>',
    faqs:[]
  }
};

Object.entries(guides).forEach(([path, data]) => router.get(path, (req,res) => {
  const canonical = SITE_URL + path;
  const webpageSchema = { '@context':'https://schema.org', '@type':'WebPage', name:data.heading, url:canonical, description:data.description };
  const faqSchema = data.faqs.length ? { '@context':'https://schema.org', '@type':'FAQPage', mainEntity:data.faqs.map(([question, answer]) => ({ '@type':'Question', name:question, acceptedAnswer:{ '@type':'Answer', text:answer } })) } : null;
  const schema = faqSchema ? [webpageSchema, faqSchema] : webpageSchema;
  const faqHtml = data.faqs.length ? `<section><h2>Frequently asked questions</h2>${data.faqs.map(([q,a]) => `<div><h3>${escape(q)}</h3><p>${escape(a)}</p></div>`).join('')}</section>` : '';
  res.send(page({ title:data.title, description:data.description, canonical, og:{ 'og:title':data.title, 'og:description':data.description, 'og:type':'website', 'og:url':canonical, 'og:site_name':'Blaze Beasley Real Estate', 'twitter:card':'summary', 'twitter:title':data.title, 'twitter:description':data.description }, schema }, `<article><h1>${data.heading}</h1>${data.body}${faqHtml}<p><a href="/#contact">Start a private consultation</a></p></article>`));
}));

const neighborhoods = {
  '/neighborhoods/guadalupe': ['Guadalupe, San Miguel de Allende Real Estate | Blaze Beasley','Explore homes and real estate in Guadalupe, San Miguel de Allende, and compare the neighborhood with other parts of the city.','Guadalupe Real Estate in San Miguel de Allende','Guadalupe is a San Miguel area known for its colorful streets, creative energy, and mix of historic and contemporary homes. Explore available properties and decide whether the neighborhood fits the way you want to live.'],
  '/neighborhoods/la-lejona': ['La Lejona, San Miguel de Allende Real Estate | Blaze Beasley','Explore homes and real estate in La Lejona, San Miguel de Allende, with a focused neighborhood search from Blaze Beasley.','La Lejona Real Estate in San Miguel de Allende','La Lejona offers a mix of residential properties and newer development, making it worth comparing when your search includes modern homes, amenities, and a residential setting.'],
  '/neighborhoods/los-senderos': ['Los Senderos, San Miguel de Allende Real Estate | Blaze Beasley','Explore homes and real estate in Los Senderos, San Miguel de Allende, and compare available properties for your lifestyle.','Los Senderos Real Estate in San Miguel de Allende','Los Senderos is a residential community to consider when your search includes newer homes, shared amenities, and a community-oriented setting outside the historic core.'],
  '/neighborhoods/malanquin': ['Malanquín, San Miguel de Allende Real Estate | Blaze Beasley','Explore homes and real estate in Malanquín, San Miguel de Allende, and compare properties in this established residential area.','Malanquín Real Estate in San Miguel de Allende','Malanquín is an established San Miguel residential area with a variety of housing options. Compare properties, setting, and access to the parts of the city that matter to you.'],
  '/neighborhoods/ojo-de-agua': ['Ojo de Agua, San Miguel de Allende Real Estate | Blaze Beasley','Explore homes and real estate in Ojo de Agua, San Miguel de Allende, and discover properties suited to different lifestyles.','Ojo de Agua Real Estate in San Miguel de Allende','Ojo de Agua is a residential area near San Miguel de Allende’s historic center. Compare its homes, streets, setting, and proximity to the places you use most.'],
  '/neighborhoods/zirandaro': ['Zirándaro, San Miguel de Allende Real Estate | Blaze Beasley','Explore homes and real estate in Zirándaro, San Miguel de Allende, including residential properties and community amenities.','Zirándaro Real Estate in San Miguel de Allende','Zirándaro is a planned residential community known for its golf and recreational setting. Explore available properties and compare the community with other San Miguel options.']
};

Object.entries(neighborhoods).forEach(([path, [title, description, heading, body]]) => router.get(path, (req,res) => {
  const canonical = SITE_URL + path;
  const schema = { '@context':'https://schema.org', '@type':'Place', name:heading.replace(' Real Estate in San Miguel de Allende',''), description, url:canonical, containedInPlace:{ '@type':'City', name:'San Miguel de Allende' } };
  res.send(page({ title, description, canonical, og:{ 'og:title':title, 'og:description':description, 'og:type':'website', 'og:url':canonical, 'og:site_name':'Blaze Beasley Real Estate', 'twitter:card':'summary', 'twitter:title':title, 'twitter:description':description }, schema }, `<article><p><a href="/neighborhoods">San Miguel de Allende neighborhoods</a></p><h1>${heading}</h1><p>${body}</p><h2>Explore ${escape(heading.replace(' Real Estate in San Miguel de Allende',''))} properties</h2><p><a href="/#listings">Browse available properties</a> or <a href="/#contact">request a focused search</a>.</p><p><a href="/neighborhoods">Compare more San Miguel neighborhoods</a> · <a href="/buying-san-miguel-de-allende">Read the buying guide</a></p></article>`));
}));

module.exports = router;
