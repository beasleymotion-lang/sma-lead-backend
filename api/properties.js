const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

function esc(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\*/g, '\\*');
}

function supabaseUrl(params = '') {
  return `${SUPABASE_URL}/rest/v1/properties?${params}`;
}

async function querySupabase(params) {
  const response = await fetch(supabaseUrl(params), {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || body?.error || 'Supabase request failed');
  }
  return body || [];
}

export default async function handler(req, res) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ ok: false, error: 'Supabase connection is not configured.' });
  }

  try {
    const q = req.query || {};
    const params = new URLSearchParams();
    params.set('select', '*');
    params.set('archived', 'eq.false');

    if (q.status && q.featured !== 'true') params.set('status', `eq.${q.status}`);
    if (q.neighborhood) params.set('neighborhood', `eq.${q.neighborhood}`);
    if (q.propertyType) params.set('property_type', `eq.${q.propertyType}`);
    if (q.minPrice) params.set('price', `gte.${Number(q.minPrice)}`);
    if (q.maxPrice) params.append('price', `lte.${Number(q.maxPrice)}`);
    if (q.bedrooms) params.set('bedrooms', `gte.${Number(q.bedrooms)}`);
    if (q.bathrooms) params.set('bathrooms', `gte.${Number(q.bathrooms)}`);
    if (q.featured === 'true') params.set('featured', 'eq.true');

    if (q.search) {
      const term = esc(q.search);
      params.set('or', `(title.ilike.*${term}*,neighborhood.ilike.*${term}*,address.ilike.*${term}*)`);
    }

    switch (q.sort) {
      case 'price_low':
        params.set('order', 'price.asc');
        break;
      case 'price_high':
        params.set('order', 'price.desc');
        break;
      case 'featured':
        params.set('order', 'featured.desc,sort_order.asc,created_at.desc');
        break;
      case 'manual':
        params.set('order', 'sort_order.asc');
        break;
      default:
        params.set('order', 'created_at.desc');
    }

    const properties = await querySupabase(params.toString());
    return res.status(200).json({
      ok: true,
      properties: Array.isArray(properties) ? properties : []
    });
  } catch (error) {
    console.error('[vercel properties] list failed:', error);
    return res.status(500).json({
      ok: false,
      error: 'Could not load properties.'
    });
  }
}
