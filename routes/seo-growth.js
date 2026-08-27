const express = require('express');
const { SITE_URL } = require('../lib/seo');
const router = express.Router();

const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

const page = ({ title, description, path, heading, intro, sections, related = [] }) => {
  const canonical = `${SITE_URL}${path}`;
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      url: canonical,
      description,
      inLanguage: 'en-US',
      about: { '@type': 'Place', name: 'San Miguel de Allende', address: { '@type': 'PostalAddress', addressLocality: 'San Miguel de Allende', addressRegion: 'Guanajuato', addressCountry: 'MX' } }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: heading, item: canonical }
      ]
    }
  ];
  return `<!doctype html><html lang="en"><head><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${escape(canonical)}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="viewport" content="width=device-width,initial-scale=1"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(canonical)}"><meta property="og:site_name" content="WithBeasley"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">${schema.map(item => `<script type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`).join('')}</head><body><header><a href="/">WithBeasley</a><nav aria-label="Primary"><a href="/#listings">Properties</a> <a href="/homes-for-sale-san-miguel-de-allende">Homes for Sale</a> <a href="/homes-for-rent-san-miguel-de-allende">Homes for Rent</a> <a href="/neighborhoods">Neighborhoods</a> <a href="/moving-to-san-miguel-de-allende">Moving to San Miguel</a></nav></header><main><article><p><a href="/">Home</a> / San Miguel de Allende</p><h1>${escape(heading)}</h1><p>${escape(intro)}</p>${sections.map(s => `<section><h2>${escape(s.h2)}</h2><p>${escape(s.body)}</p></section>`).join('')}<section><h2>Explore WithBeasley</h2><p><a href="/#listings">Browse current properties</a> · <a href="/homes-for-sale-san-miguel-de-allende">Homes for sale</a> · <a href="/homes-for-rent-san-miguel-de-allende">Homes for rent</a> · <a href="/neighborhoods">Neighborhood guide</a> · <a href="/#contact">Start a focused search</a></p>${related.length ? `<p>Related: ${related.map(r => `<a href="${escape(r.path)}">${escape(r.label)}</a>`).join(' · ')}</p>` : ''}</section></article></main><footer><p>Blaze Beasley · San Miguel de Allende, Guanajuato, Mexico</p></footer></body></html>`;
};

const pages = {
  '/san-miguel-de-allende-real-estate': {
    title: 'San Miguel de Allende Real Estate | Homes & Properties | WithBeasley',
    description: 'Explore San Miguel de Allende real estate, homes, rentals, neighborhoods, and current property opportunities with Blaze Beasley.',
    heading: 'San Miguel de Allende Real Estate',
    intro: 'Explore homes and properties in San Miguel de Allende with a search organized around the neighborhoods, lifestyle, budget, and property features that matter to you.',
    sections: [
      ['Start with the right area', 'San Miguel de Allende is made up of distinct neighborhoods and settings. Begin by identifying the parts of the city that fit your daily routine, preferred atmosphere, and plans for the property.'],
      ['Compare real properties', 'Use the current property collection to compare homes by location, property type, size, bedrooms, bathrooms, price, and other available details.'],
      ['Make the search practical', 'If you are buying, renting, relocating, or exploring an investment, a focused brief makes it easier to narrow the search and spend time on properties that fit.']
    ]
  },
  '/san-miguel-de-allende-houses-for-sale': {
    title: 'San Miguel de Allende Houses for Sale | WithBeasley',
    description: 'Browse houses for sale in San Miguel de Allende and narrow your search by neighborhood, property type, size, price, and lifestyle needs.',
    heading: 'Houses for Sale in San Miguel de Allende',
    intro: 'Looking for a house for sale in San Miguel de Allende? Start with the location and lifestyle you want, then compare current homes against your priorities.',
    sections: [
      ['Choose your priorities', 'Think about bedrooms, bathrooms, outdoor space, architectural style, walkability, parking, and the neighborhoods you want to explore.'],
      ['Review current listings', 'Current availability changes over time. Browse the live property collection for homes that are currently presented as for sale.'],
      ['Ask for a focused search', 'If the right home is not obvious, share your budget, preferred areas, timing, and must-have features so the search can be narrowed around your actual needs.']
    ]
  },
  '/san-miguel-de-allende-rentals': {
    title: 'San Miguel de Allende Rentals | Homes for Rent | WithBeasley',
    description: 'Explore San Miguel de Allende rentals and homes for rent by neighborhood, budget, timing, and the features you need for your stay.',
    heading: 'San Miguel de Allende Rentals',
    intro: 'Find a rental in San Miguel de Allende by starting with the neighborhood, length of stay, budget, furnishing needs, and daily routine that fit your plans.',
    sections: [
      ['Rent before you decide', 'For many people, renting can be a practical way to experience San Miguel before making a longer-term property decision.'],
      ['Match the home to your routine', 'Consider proximity to the places you visit most, the amount of space you need, outdoor areas, parking, furnishings, and the timing of your stay.'],
      ['Review available rentals', 'Browse current rental properties and use a focused request when you need help narrowing the options.']
    ]
  },
  '/centro-san-miguel-de-allende-real-estate': {
    title: 'Centro San Miguel de Allende Real Estate | WithBeasley',
    description: 'Explore real estate in Centro San Miguel de Allende and compare current homes and properties with a focused local search.',
    heading: 'Centro San Miguel de Allende Real Estate',
    intro: 'Centro is one of the most recognizable areas of San Miguel de Allende. Explore current property opportunities and decide whether the central setting fits the way you want to live.',
    sections: [
      ['Start with lifestyle', 'Consider how you want to use the home, how often you want to walk to daily destinations, and what type of setting and property character you prefer.'],
      ['Compare available properties', 'The right property depends on more than a neighborhood name. Compare current listings by price, size, layout, outdoor space, and other available details.'],
      ['Explore nearby options', 'If Centro is not the perfect fit, compare nearby San Miguel neighborhoods before narrowing the search.']
    ],
    related: [{ path: '/neighborhoods/guadalupe', label: 'Guadalupe real estate' }, { path: '/neighborhoods/ojo-de-agua', label: 'Ojo de Agua real estate' }]
  },
  '/san-antonio-san-miguel-de-allende-real-estate': {
    title: 'San Antonio San Miguel de Allende Real Estate | WithBeasley',
    description: 'Explore homes and real estate in San Antonio, San Miguel de Allende, and compare current properties with a focused search.',
    heading: 'San Antonio San Miguel de Allende Real Estate',
    intro: 'Explore property opportunities around San Antonio and compare homes based on the setting, space, budget, and lifestyle you want.',
    sections: [
      ['Build a neighborhood shortlist', 'Consider San Antonio alongside other San Miguel areas so your search is based on the way you want to live rather than a single address.'],
      ['Compare homes', 'Review current properties and focus on the features that matter most, including property type, bedrooms, bathrooms, size, and price when available.'],
      ['Get a focused search', 'Share your preferred area, budget, timing, and must-have features to narrow the property search.']
    ]
  },
  '/guadiana-san-miguel-de-allende-real-estate': {
    title: 'Guadiana San Miguel de Allende Real Estate | WithBeasley',
    description: 'Explore homes and real estate in Guadiana, San Miguel de Allende, and compare current property opportunities.',
    heading: 'Guadiana San Miguel de Allende Real Estate',
    intro: 'Explore Guadiana as part of a broader San Miguel de Allende property search, then compare current homes against your lifestyle and budget.',
    sections: [
      ['Search by lifestyle', 'Think about the pace, walkability, home style, outdoor space, and daily destinations that matter to you.'],
      ['Compare current homes', 'Use current listings to compare properties rather than relying on a generic neighborhood description.'],
      ['Expand your options', 'A focused San Miguel search can include Guadiana and nearby neighborhoods so you can compare the tradeoffs before deciding.']
    ]
  },
  '/buying-a-home-in-san-miguel-de-allende': {
    title: 'Buying a Home in San Miguel de Allende | WithBeasley',
    description: 'A practical starting point for buying a home in San Miguel de Allende, from defining your search to comparing properties and next steps.',
    heading: 'Buying a Home in San Miguel de Allende',
    intro: 'Buying a home in San Miguel de Allende starts with a clear brief: where you want to live, how you will use the property, your budget, and the features that are essential.',
    sections: [
      ['Define the search', 'Choose the neighborhoods, property type, approximate budget, timing, and must-have features that should guide the search.'],
      ['Compare properties in context', 'Look beyond photos and price. Compare location, layout, outdoor space, condition, and the practical details that affect how the home will work for you.'],
      ['Use qualified professionals for specialized advice', 'Legal, tax, financing, residency, and other specialized questions should be handled by the appropriately qualified professionals. The property search can be organized separately around your goals.']
    ]
  }
};

Object.entries(pages).forEach(([path, data]) => {
  router.get(path, (req, res) => res.send(page({ ...data, path, sections: data.sections.map(([h2, body]) => ({ h2, body })) })));
});

module.exports = router;
