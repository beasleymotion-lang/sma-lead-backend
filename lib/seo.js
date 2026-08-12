// lib/seo.js
// Auto-generates SEO title, meta description, Open Graph tags, and
// Schema.org RealEstateListing structured data for a property record.

const SITE_URL = process.env.SITE_URL || 'https://example.com';
const AGENT_NAME = 'Blaze Beasley';
const AGENCY = 'Blaze Beasley Real Estate';

function fmtPrice(price, currency) {
  const n = Math.round(Number(price) || 0);
  return `${currency === 'MXN' ? 'MXN $' : '$'}${n.toLocaleString('en-US')}`;
}

function generateSeoTitle(p) {
  const loc = p.neighborhood ? `${p.neighborhood}, San Miguel de Allende` : 'San Miguel de Allende';
  const full = `${p.title} | ${loc} | ${AGENCY}`;
  if (full.length <= 70) return full;
  // Truncate at the last full "| segment" that fits, rather than cutting
  // a word in half mid-string (was previously producing things like
  // "...Blaze Beasley Real Esta").
  const segments = full.split(' | ');
  let out = segments[0];
  for (let i = 1; i < segments.length; i++) {
    const candidate = `${out} | ${segments[i]}`;
    if (candidate.length > 70) break;
    out = candidate;
  }
  return out;
}

function generateMetaDescription(p) {
  const bd = p.bedrooms ? `${p.bedrooms} bed` : '';
  const ba = p.bathrooms ? `${p.bathrooms} bath` : '';
  const stats = [bd, ba].filter(Boolean).join(', ');
  const base = p.short_description || p.luxury_description || '';
  const price = fmtPrice(p.price, p.currency);
  let desc = `${p.title} in ${p.neighborhood || 'San Miguel de Allende'} — ${stats}${stats ? '. ' : ''}${price}. ${base}`;
  return desc.replace(/\s+/g, ' ').trim().slice(0, 158);
}

function propertyUrl(slug) {
  return `${SITE_URL}/properties/${slug}`;
}

function generateOgTags(p) {
  return {
    'og:title': p.seo_title || generateSeoTitle(p),
    'og:description': p.meta_description || generateMetaDescription(p),
    'og:type': 'website',
    'og:url': propertyUrl(p.slug),
    'og:image': p.og_image || p.featured_image || '',
    'og:site_name': AGENCY,
    'og:locale': 'en_US',
    'twitter:card': 'summary_large_image',
    'twitter:title': p.seo_title || generateSeoTitle(p),
    'twitter:description': p.meta_description || generateMetaDescription(p),
    'twitter:image': p.og_image || p.featured_image || '',
  };
}

function generateStructuredData(p) {
  const statusMap = {
    for_sale: 'https://schema.org/ForSale',
    for_rent: 'https://schema.org/ForSale',
    pending: 'https://schema.org/ForSale',
    sold: 'https://schema.org/SoldOut',
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: p.title,
    url: propertyUrl(p.slug),
    description: p.meta_description || generateMetaDescription(p),
    image: (p.images || []).map((i) => i.url).filter(Boolean),
    datePosted: p.created_at,
    address: {
      '@type': 'PostalAddress',
      streetAddress: p.address || undefined,
      addressLocality: p.neighborhood || 'San Miguel de Allende',
      addressRegion: 'Guanajuato',
      addressCountry: 'MX',
    },
    geo: (p.map_lat && p.map_lng) ? {
      '@type': 'GeoCoordinates',
      latitude: p.map_lat,
      longitude: p.map_lng,
    } : undefined,
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: p.currency || 'USD',
      availability: statusMap[p.status] || 'https://schema.org/ForSale',
      url: propertyUrl(p.slug),
    },
    numberOfRooms: p.bedrooms || undefined,
    numberOfBathroomsTotal: p.bathrooms || undefined,
    floorSize: p.construction_size ? {
      '@type': 'QuantitativeValue',
      value: p.construction_size,
      unitCode: 'MTK',
    } : undefined,
    broker: {
      '@type': 'RealEstateAgent',
      name: AGENT_NAME,
    },
  };
}

function generateBreadcrumbs(p) {
  return [
    { name: 'Home', url: SITE_URL },
    { name: 'Properties', url: `${SITE_URL}/#listings` },
    { name: p.neighborhood || 'Property', url: `${SITE_URL}/#neighborhoods` },
    { name: p.title, url: propertyUrl(p.slug) },
  ];
}

// Auto-fill seo_title / meta_description / og_image on a property record
// if the admin left them blank when publishing.
function autofillSeoFields(p) {
  return {
    ...p,
    seo_title: p.seo_title || generateSeoTitle(p),
    meta_description: p.meta_description || generateMetaDescription(p),
    og_image: p.og_image || p.featured_image || (p.images && p.images[0]?.url) || null,
  };
}

module.exports = {
  generateSeoTitle, generateMetaDescription, generateOgTags,
  generateStructuredData, generateBreadcrumbs, autofillSeoFields, propertyUrl, fmtPrice,
};
