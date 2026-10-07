const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase connection is not configured.' });
  }

  try {
    const slug = String(req.query?.slug || '');
    const url = new URL('/rest/v1/properties', SUPABASE_URL);
    url.searchParams.set('select', '*');
    url.searchParams.set('slug', `eq.${slug}`);
    url.searchParams.set('archived', 'eq.false');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const rows = await response.json().catch(() => null);
    if (!response.ok) throw new Error(rows?.message || 'Supabase request failed');

    const property = Array.isArray(rows) ? rows[0] : null;
    if (!property) {
      return res.status(404).json({ ok: false, error: 'Property not found.' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.status(200).json({
      ok: true,
      property,
      seo: {
        title: property.seo_title,
        metaDescription: property.meta_description,
        breadcrumbs: [
          { name: 'Home', url: '/' },
          { name: 'Properties', url: '/properties' },
          { name: property.title, url: `/properties/${property.slug}` }
        ],
        keywords: [
          property.title,
          property.neighborhood,
          'San Miguel de Allende real estate'
        ].filter(Boolean)
      }
    });
  } catch (error) {
    console.error('[vercel properties] detail failed:', error);
    return res.status(500).json({ ok: false, error: 'Could not load property.' });
  }
}
