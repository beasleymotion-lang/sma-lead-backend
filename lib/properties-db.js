// lib/properties-db.js
// Supabase storage for property listings.

const supabase = require('./supabase');

const JSON_FIELDS = [
  'highlights_json',
  'features_json',
  'amenities_json',
  'images_json'
];

function rowToProperty(row) {
  if (!row) return null;

  const out = { ...row };

  out.highlights = safeParse(row.highlights_json, []);
  out.features = safeParse(row.features_json, []);
  out.amenities = safeParse(row.amenities_json, []);
  out.images = safeParse(row.images_json, []);

  JSON_FIELDS.forEach((field) => delete out[field]);

  out.featured = !!row.featured;
  out.archived = !!row.archived;

  return out;
}

function safeParse(value, fallback) {
  if (Array.isArray(value) || (value && typeof value === 'object')) {
    return value;
  }

  try {
    return JSON.parse(value || 'null') ?? fallback;
  } catch {
    return fallback;
  }
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(base, excludeId = null) {
  const slug = slugify(base) || 'property';

  let candidate = slug;
  let n = 1;

  while (true) {
    let query = supabase
      .from('properties')
      .select('id')
      .eq('slug', candidate)
      .limit(1);

    if (excludeId !== null) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) {
      return candidate;
    }

    n += 1;
    candidate = `${slug}-${n}`;
  }
}

function normalizeInput(data, slug) {
  return {
    slug,
    title: data.title || 'Untitled Property',
    price: Number(data.price) || 0,
    currency: data.currency || 'USD',
    status: data.status || 'for_sale',
    featured: !!data.featured,
    archived: !!data.archived,
    sort_order: Number.isFinite(Number(data.sort_order))
      ? Number(data.sort_order)
      : 0,

    property_type: data.property_type || null,
    neighborhood: data.neighborhood || null,
    address: data.address || null,
    map_lat: data.map_lat != null ? Number(data.map_lat) : null,
    map_lng: data.map_lng != null ? Number(data.map_lng) : null,

    bedrooms: data.bedrooms != null ? Number(data.bedrooms) : null,
    bathrooms: data.bathrooms != null ? Number(data.bathrooms) : null,
    half_bathrooms:
      data.half_bathrooms != null ? Number(data.half_bathrooms) : null,
    parking: data.parking != null ? Number(data.parking) : null,
    construction_size:
      data.construction_size != null
        ? Number(data.construction_size)
        : null,
    lot_size: data.lot_size != null ? Number(data.lot_size) : null,
    year_built: data.year_built != null ? Number(data.year_built) : null,
    floors: data.floors != null ? Number(data.floors) : null,

    short_description: data.short_description || null,
    luxury_description: data.luxury_description || null,

    highlights_json: data.highlights || [],
    features_json: data.features || [],
    amenities_json: data.amenities || [],

    featured_image:
      data.featured_image ||
      (Array.isArray(data.images) && data.images[0]?.url) ||
      null,

    images_json: data.images || [],

    seo_title: data.seo_title || null,
    meta_description: data.meta_description || null,
    og_image: data.og_image || data.featured_image || null
  };
}

async function listProperties({
  status,
  neighborhood,
  minPrice,
  maxPrice,
  bedrooms,
  bathrooms,
  propertyType,
  featured,
  includeArchived = false,
  sort = 'newest',
  search
} = {}) {
  let query = supabase.from('properties').select('*');

  if (!includeArchived) {
    query = query.eq('archived', false);
  }

  if (status) query = query.eq('status', status);
  if (neighborhood) query = query.eq('neighborhood', neighborhood);
  if (propertyType) query = query.eq('property_type', propertyType);
  if (minPrice !== undefined) query = query.gte('price', minPrice);
  if (maxPrice !== undefined) query = query.lte('price', maxPrice);
  if (bedrooms !== undefined) query = query.gte('bedrooms', bedrooms);
  if (bathrooms !== undefined) query = query.gte('bathrooms', bathrooms);
  if (featured) query = query.eq('featured', true);

  if (search) {
    const escaped = String(search).replace(/[%_]/g, '\\$&');

    query = query.or(
      `title.ilike.%${escaped}%,neighborhood.ilike.%${escaped}%,address.ilike.%${escaped}%`
    );
  }

  switch (sort) {
    case 'price_low':
      query = query.order('price', { ascending: true });
      break;

    case 'price_high':
      query = query.order('price', { ascending: false });
      break;

    case 'featured':
      query = query
        .order('featured', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      break;

    case 'manual':
      query = query.order('sort_order', { ascending: true });
      break;

    case 'newest':
    default:
      query = query.order('created_at', { ascending: false });
      break;
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(rowToProperty);
}

async function getPropertyBySlug(slug) {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;

  return rowToProperty(data);
}

async function getPropertyById(id) {
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  return rowToProperty(data);
}

async function insertProperty(data) {
  const slug = await uniqueSlug(data.slug || data.title);
  const row = normalizeInput(data, slug);

  const { data: inserted, error } = await supabase
    .from('properties')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;

  return rowToProperty(inserted);
}

async function updateProperty(id, data) {
  const existing = await getPropertyById(id);

  if (!existing) return null;

  const slug =
    data.title &&
    data.title !== existing.title &&
    !data.slugLocked
      ? await uniqueSlug(data.slug || data.title, id)
      : existing.slug;

  const merged = {
    ...existing,
    ...data,
    slug
  };

  const row = normalizeInput(merged, slug);

  const { data: updated, error } = await supabase
    .from('properties')
    .update({
      ...row,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;

  return rowToProperty(updated);
}

async function deleteProperty(id) {
  const { error, count } = await supabase
    .from('properties')
    .delete({ count: 'exact' })
    .eq('id', id);

  if (error) throw error;

  return count > 0;
}

async function duplicateProperty(id) {
  const original = await getPropertyById(id);

  if (!original) return null;

  return insertProperty({
    ...original,
    title: `${original.title} (Copy)`,
    featured: false,
    status: 'for_sale'
  });
}

async function setStatus(id, status) {
  return updateProperty(id, { status });
}

async function setFeatured(id, featured) {
  return updateProperty(id, { featured: !!featured });
}

async function setArchived(id, archived) {
  return updateProperty(id, { archived: !!archived });
}

async function reorder(idsInOrder) {
  for (let i = 0; i < idsInOrder.length; i++) {
    const { error } = await supabase
      .from('properties')
      .update({
        sort_order: i,
        updated_at: new Date().toISOString()
      })
      .eq('id', idsInOrder[i]);

    if (error) throw error;
  }
}

async function incrementViews(id) {
  const property = await getPropertyById(id);

  if (!property) return;

  const { error } = await supabase
    .from('properties')
    .update({
      views: Number(property.views || 0) + 1
    })
    .eq('id', id);

  if (error) throw error;
}

async function dashboardStats() {
  const { data, error } = await supabase
    .from('properties')
    .select('id, title, slug, status, featured, archived, views');

  if (error) throw error;

  const properties = data || [];
  const active = properties.filter((p) => !p.archived);

  const total = active.length;
  const featured = active.filter((p) => p.featured).length;
  const forSale = active.filter((p) => p.status === 'for_sale').length;
  const forRent = active.filter((p) => p.status === 'for_rent').length;
  const pending = active.filter((p) => p.status === 'pending').length;
  const sold = active.filter((p) => p.status === 'sold').length;

  const mostViewed = active
    .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      views: p.views || 0
    }));

  return {
    total,
    featured,
    forSale,
    forRent,
    pending,
    sold,
    mostViewed
  };
}

module.exports = {
  slugify,
  uniqueSlug,
  listProperties,
  getPropertyBySlug,
  getPropertyById,
  insertProperty,
  updateProperty,
  deleteProperty,
  duplicateProperty,
  setStatus,
  setFeatured,
  setArchived,
  reorder,
  incrementViews,
  dashboardStats
};
