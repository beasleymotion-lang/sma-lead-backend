const SITE_URL = 'https://withbeasley.com';
const AGENT_NAME = 'Blaze Beasley';
const AGENCY = 'Blaze Beasley Real Estate';

function fmtPrice(price, currency) {
  const value = Number(price);
  return Number.isFinite(value) && value > 0
    ? `${currency === 'MXN' ? 'MXN $' : '$'}${Math.round(value).toLocaleString('en-US')}`
    : '';
}
function propertyUrl(slug) { return `${SITE_URL}/properties/${encodeURIComponent(slug)}`; }
function generateSeoTitle(p) {
  const location = p.neighborhood ? `${p.neighborhood}, San Miguel de Allende` : 'San Miguel de Allende';
  return `${p.title} | ${location} Real Estate`.slice(0, 60);
}
function generateMetaDescription(p) {
  const facts = [p.property_type, p.bedrooms && `${p.bedrooms} bed`, p.bathrooms && `${p.bathrooms} bath`, fmtPrice(p.price, p.currency)].filter(Boolean).join(' · ');
  return `${p.title} in ${p.neighborhood || 'San Miguel de Allende'}. ${facts}.${p.short_description ? ` ${p.short_description}` : ''}`.replace(/\s+/g, ' ').trim().slice(0, 155);
}
function absoluteUrl(value) { try { return value ? new URL(value, SITE_URL).href : ''; } catch { return ''; } }
function generateOgTags(p) {
  const image = absoluteUrl(p.og_image || p.featured_image || p.images?.[0]?.url);
  return {
    'og:title': p.seo_title || generateSeoTitle(p), 'og:description': p.meta_description || generateMetaDescription(p),
    'og:type': 'website', 'og:url': propertyUrl(p.slug), 'og:site_name': AGENCY, 'og:locale': 'en_US',
    ...(image ? { 'og:image': image } : {}), 'twitter:card': image ? 'summary_large_image' : 'summary',
    'twitter:title': p.seo_title || generateSeoTitle(p), 'twitter:description': p.meta_description || generateMetaDescription(p),
    ...(image ? { 'twitter:image': image } : {}),
  };
}
function generateStructuredData(p) {
  const images = (p.images || []).map(i => absoluteUrl(i.url)).filter(Boolean);
  const price = Number(p.price);
  return {
    '@context': 'https://schema.org', '@type': 'RealEstateListing', name: p.title, url: propertyUrl(p.slug),
    description: p.meta_description || generateMetaDescription(p), ...(images.length ? { image: images } : {}),
    ...(p.created_at ? { datePosted: p.created_at } : {}),
    address: { '@type': 'PostalAddress', ...(p.address ? { streetAddress: p.address } : {}), addressLocality: p.neighborhood || 'San Miguel de Allende', addressRegion: 'Guanajuato', addressCountry: 'MX' },
    ...(p.map_lat != null && p.map_lng != null ? { geo: { '@type': 'GeoCoordinates', latitude: p.map_lat, longitude: p.map_lng } } : {}),
    ...(Number.isFinite(price) && price > 0 ? { offers: { '@type': 'Offer', price, priceCurrency: p.currency || 'USD', availability: 'https://schema.org/InStock', url: propertyUrl(p.slug) } } : {}),
    ...(p.bedrooms ? { numberOfRooms: p.bedrooms } : {}), ...(p.bathrooms ? { numberOfBathroomsTotal: p.bathrooms } : {}),
    ...(p.construction_size ? { floorSize: { '@type': 'QuantitativeValue', value: p.construction_size, unitCode: 'MTK' } } : {}),
    broker: { '@type': 'RealEstateAgent', name: AGENT_NAME, url: SITE_URL },
  };
}
function generateBreadcrumbs(p) { return [{ name: 'Home', url: SITE_URL }, { name: 'Properties', url: SITE_URL + '/#listings' }, { name: p.title, url: propertyUrl(p.slug) }]; }
function autofillSeoFields(p) { return { ...p, seo_title: p.seo_title || generateSeoTitle(p), meta_description: p.meta_description || generateMetaDescription(p), og_image: p.og_image || p.featured_image || p.images?.[0]?.url || null }; }
module.exports = { SITE_URL, AGENT_NAME, AGENCY, fmtPrice, propertyUrl, generateSeoTitle, generateMetaDescription, generateOgTags, generateStructuredData, generateBreadcrumbs, autofillSeoFields };
