// lib/properties-db.js
// Supabase storage for property listings.

const supabase = require('./supabase');

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPermanentImage(image) {
  if (!image || typeof image !== 'object' || typeof image.url !== 'string') return false;
  // Never expose legacy Render/local filesystem paths as listing photos.
  return !/\/tmp\/uploads\//i.test(image.url) && !/\/uploads\//i.test(image.url);
}

function normalizeImages(value) {
  return safeArray(value)
    .filter(isPermanentImage)
    .slice(0, 20)
    .map((img, index) => ({
      ...img,
      order: Number.isFinite(Number(img.order)) ? Number(img.order) : index
    }))
    .sort((a, b) => a.order - b.order)
    .map((img, index) => ({ ...img, order: index }));
}

function rowToProperty(row) {
  if (!row) return null;

  const images = normalizeImages(row.images);
  const featuredImage =
    (images[0] && images[0].url) ||
    (typeof row.featured_image === 'string' && isPermanentImage({ url: row.featured_image })
      ? row.featured_image
      : null);

  return {
    ...row,
    highlights: safeArray(row.highlights),
    features: safeArray(row.features),
    amenities: safeArray(row.amenities),
    images,
    featured_image: featuredImage,
    featured: !!row.featured,
    archived: !!row.archived,
  };
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
  const baseSlug = slugify(base) || 'property';
  let candidate = baseSlug;
  let n = 1;

  while (true) {
    let query = supabase
      .from('properties')
      .select('id')
      .eq('slug', candidate)
      .limit(1);

    if (excludeId != null) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) throw error;
    if (!data || data.length === 0) return candidate;

    n += 1;
    candidate = `${baseSlug}-${n}`;
  }
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

  if (!includeArchived) query = query.eq('archived', false);
  if (status) query = query.eq('status', status);
  if (neighborhood) query = query.eq('neighborhood', neighborhood);
  if (propertyType) query = query.eq('property_type', propertyType);
  if (minPrice != null) query = query.gte('price', minPrice);
  if (maxPrice != null) query = query.lte('price', maxPrice);
  if (bedrooms != null) query = query.gte('bedrooms', bedrooms);
  if (bathrooms != null) query = query.gte('bathrooms', bathrooms);
  if (featured) query = query.eq('featured', true);

  if (search) {
    const term = `%${search}%`;
    query = query.or(
      `title.ilike.${term},neighborhood.ilike.${term},address.ilike.${term}`
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

    default:
      query = query.order('created_at', { ascending: false });
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
      data.construction_size != null ? Number(data.construction_size) : null,
    lot_size: data.lot_size != null ? Number(data.lot_size) : null,
    year_built: data.year_built != null ? Number(data.year_built) : null,
    floors: data.floors != null ? Number(data.floors) : null,

    short_description: data.short_description || null,
    luxury_description: data.luxury_description || null,

    highlights: Array.isArray(data.highlights) ? data.highlights : [],
    features: Array.isArray(data.features) ? data.features : [],
    amenities: Array.isArray(data.amenities) ? data.amenities : [],

    featured_image:
      data.featured_image ||
      (Array.isArray(data.images) && data.images[0]?.url) ||
      null,

    images: Array.isArray(data.images) ? data.images : [],

    seo_title: data.seo_title || null,
    meta_description: data.meta_description || null,
    og_image: data.og_image || data.featured_image || null,
  };
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
    slug,
  };

  const row = normalizeInput(merged, slug);

  const { data: updated, error } = await supabase
    .from('properties')
    .update(row)
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

  const copy = {
    ...original,
    title: `${original.title} (Copy)`,
    featured: false,
    status: 'for_sale',
  };

  delete copy.id;
  delete copy.created_at;
  delete copy.updated_at;
  delete copy.views;

  return insertProperty(copy);
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
      .update({ sort_order: i })
      .eq('id', idsInOrder[i]);

    if (error) throw error;
  }
}

async function incrementViews(id) {
  const property = await getPropertyById(id);
  if (!property) return;

  const { error } = await supabase
    .from('properties')
    .update({ views: (property.views || 0) + 1 })
    .eq('id', id);

  if (error) throw error;
}

async function dashboardStats() {
  const { data, error } = await supabase
    .from('properties')
    .select('id, title, slug, price, status, featured, archived, views, created_at')
    .eq('archived', false);

  if (error) throw error;

  const rows = data || [];

  const total = rows.length;
  const featured = rows.filter(p => p.featured).length;
  const forSale = rows.filter(p => p.status === 'for_sale').length;
  const forRent = rows.filter(p => p.status === 'for_rent').length;
  const pending = rows.filter(p => p.status === 'pending').length;
  const sold = rows.filter(p => p.status === 'sold').length;

  const mostViewed = [...rows]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5)
    .map(p => ({
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
