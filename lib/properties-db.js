// lib/properties-db.js
// SQLite storage for property listings. Same pattern as lib/db.js (leads):
// swap for Postgres/Supabase later by keeping these function signatures.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.PROPERTIES_DB_PATH || path.join(__dirname, '..', 'data', 'properties.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'for_sale',      -- for_sale | for_rent | pending | sold
    featured INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,

    property_type TEXT,
    neighborhood TEXT,
    address TEXT,
    map_lat REAL,
    map_lng REAL,

    bedrooms INTEGER,
    bathrooms REAL,
    half_bathrooms INTEGER,
    parking INTEGER,
    construction_size REAL,
    lot_size REAL,
    year_built INTEGER,
    floors INTEGER,

    short_description TEXT,
    luxury_description TEXT,
    highlights_json TEXT DEFAULT '[]',
    features_json TEXT DEFAULT '[]',
    amenities_json TEXT DEFAULT '[]',

    featured_image TEXT,
    images_json TEXT DEFAULT '[]',

    seo_title TEXT,
    meta_description TEXT,
    og_image TEXT,

    views INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status, archived);
  CREATE INDEX IF NOT EXISTS idx_properties_featured ON properties(featured);
  CREATE INDEX IF NOT EXISTS idx_properties_neighborhood ON properties(neighborhood);
`);

const JSON_FIELDS = ['highlights_json', 'features_json', 'amenities_json', 'images_json'];

function rowToProperty(row) {
  if (!row) return null;
  const out = { ...row };
  out.highlights = safeParse(row.highlights_json, []);
  out.features = safeParse(row.features_json, []);
  out.amenities = safeParse(row.amenities_json, []);
  out.images = safeParse(row.images_json, []);
  JSON_FIELDS.forEach((f) => delete out[f]);
  out.featured = !!row.featured;
  out.archived = !!row.archived;
  return out;
}
function safeParse(str, fallback) {
  try { return JSON.parse(str || 'null') ?? fallback; } catch { return fallback; }
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function uniqueSlug(base, excludeId = null) {
  let slug = slugify(base) || 'property';
  let n = 1;
  const exists = (s) => {
    const row = excludeId
      ? db.prepare('SELECT id FROM properties WHERE slug = ? AND id != ?').get(s, excludeId)
      : db.prepare('SELECT id FROM properties WHERE slug = ?').get(s);
    return !!row;
  };
  let candidate = slug;
  while (exists(candidate)) {
    n += 1;
    candidate = `${slug}-${n}`;
  }
  return candidate;
}

function listProperties({ status, neighborhood, minPrice, maxPrice, bedrooms, bathrooms, propertyType, featured, includeArchived = false, sort = 'newest', search } = {}) {
  const where = [];
  const params = {};
  if (!includeArchived) where.push('archived = 0');
  if (status) { where.push('status = @status'); params.status = status; }
  if (neighborhood) { where.push('neighborhood = @neighborhood'); params.neighborhood = neighborhood; }
  if (propertyType) { where.push('property_type = @propertyType'); params.propertyType = propertyType; }
  if (minPrice) { where.push('price >= @minPrice'); params.minPrice = minPrice; }
  if (maxPrice) { where.push('price <= @maxPrice'); params.maxPrice = maxPrice; }
  if (bedrooms) { where.push('bedrooms >= @bedrooms'); params.bedrooms = bedrooms; }
  if (bathrooms) { where.push('bathrooms >= @bathrooms'); params.bathrooms = bathrooms; }
  if (featured) { where.push('featured = 1'); }
  if (search) { where.push('(title LIKE @search OR neighborhood LIKE @search OR address LIKE @search)'); params.search = `%${search}%`; }

  const orderMap = {
    newest: 'created_at DESC',
    price_low: 'price ASC',
    price_high: 'price DESC',
    featured: 'featured DESC, sort_order ASC, created_at DESC',
    manual: 'sort_order ASC',
  };
  const orderBy = orderMap[sort] || orderMap.newest;

  const sql = `SELECT * FROM properties ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`;
  const rows = db.prepare(sql).all(params);
  return rows.map(rowToProperty);
}

function getPropertyBySlug(slug) {
  return rowToProperty(db.prepare('SELECT * FROM properties WHERE slug = ?').get(slug));
}
function getPropertyById(id) {
  return rowToProperty(db.prepare('SELECT * FROM properties WHERE id = ?').get(id));
}

function insertProperty(data) {
  const slug = uniqueSlug(data.slug || data.title);
  const stmt = db.prepare(`
    INSERT INTO properties (
      slug, title, price, currency, status, featured, archived, sort_order,
      property_type, neighborhood, address, map_lat, map_lng,
      bedrooms, bathrooms, half_bathrooms, parking, construction_size, lot_size, year_built, floors,
      short_description, luxury_description, highlights_json, features_json, amenities_json,
      featured_image, images_json, seo_title, meta_description, og_image
    ) VALUES (
      @slug, @title, @price, @currency, @status, @featured, @archived, @sort_order,
      @property_type, @neighborhood, @address, @map_lat, @map_lng,
      @bedrooms, @bathrooms, @half_bathrooms, @parking, @construction_size, @lot_size, @year_built, @floors,
      @short_description, @luxury_description, @highlights_json, @features_json, @amenities_json,
      @featured_image, @images_json, @seo_title, @meta_description, @og_image
    )
  `);
  const row = normalizeInput(data, slug);
  const info = stmt.run(row);
  return getPropertyById(info.lastInsertRowid);
}

function updateProperty(id, data) {
  const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
  if (!existing) return null;
  const slug = data.title && data.title !== existing.title && !data.slugLocked
    ? uniqueSlug(data.slug || data.title, id)
    : existing.slug;
  const merged = { ...existing, ...data, slug };
  const row = normalizeInput(merged, slug);
  row.id = id;
  db.prepare(`
    UPDATE properties SET
      slug=@slug, title=@title, price=@price, currency=@currency, status=@status,
      featured=@featured, archived=@archived, sort_order=@sort_order,
      property_type=@property_type, neighborhood=@neighborhood, address=@address, map_lat=@map_lat, map_lng=@map_lng,
      bedrooms=@bedrooms, bathrooms=@bathrooms, half_bathrooms=@half_bathrooms, parking=@parking,
      construction_size=@construction_size, lot_size=@lot_size, year_built=@year_built, floors=@floors,
      short_description=@short_description, luxury_description=@luxury_description,
      highlights_json=@highlights_json, features_json=@features_json, amenities_json=@amenities_json,
      featured_image=@featured_image, images_json=@images_json,
      seo_title=@seo_title, meta_description=@meta_description, og_image=@og_image,
      updated_at=datetime('now')
    WHERE id=@id
  `).run(row);
  return getPropertyById(id);
}

function normalizeInput(data, slug) {
  return {
    slug,
    title: data.title || 'Untitled Property',
    price: Number(data.price) || 0,
    currency: data.currency || 'USD',
    status: data.status || 'for_sale',
    featured: data.featured ? 1 : 0,
    archived: data.archived ? 1 : 0,
    sort_order: Number.isFinite(Number(data.sort_order)) ? Number(data.sort_order) : 0,
    property_type: data.property_type || null,
    neighborhood: data.neighborhood || null,
    address: data.address || null,
    map_lat: data.map_lat != null ? Number(data.map_lat) : null,
    map_lng: data.map_lng != null ? Number(data.map_lng) : null,
    bedrooms: data.bedrooms != null ? Number(data.bedrooms) : null,
    bathrooms: data.bathrooms != null ? Number(data.bathrooms) : null,
    half_bathrooms: data.half_bathrooms != null ? Number(data.half_bathrooms) : null,
    parking: data.parking != null ? Number(data.parking) : null,
    construction_size: data.construction_size != null ? Number(data.construction_size) : null,
    lot_size: data.lot_size != null ? Number(data.lot_size) : null,
    year_built: data.year_built != null ? Number(data.year_built) : null,
    floors: data.floors != null ? Number(data.floors) : null,
    short_description: data.short_description || null,
    luxury_description: data.luxury_description || null,
    highlights_json: JSON.stringify(data.highlights || []),
    features_json: JSON.stringify(data.features || []),
    amenities_json: JSON.stringify(data.amenities || []),
    featured_image: data.featured_image || (Array.isArray(data.images) && data.images[0]?.url) || null,
    images_json: JSON.stringify(data.images || []),
    seo_title: data.seo_title || null,
    meta_description: data.meta_description || null,
    og_image: data.og_image || data.featured_image || null,
  };
}

function deleteProperty(id) {
  return db.prepare('DELETE FROM properties WHERE id = ?').run(id).changes > 0;
}

function duplicateProperty(id) {
  const original = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
  if (!original) return null;
  const copy = { ...original, title: `${original.title} (Copy)` };
  delete copy.id;
  copy.highlights = safeParse(original.highlights_json, []);
  copy.features = safeParse(original.features_json, []);
  copy.amenities = safeParse(original.amenities_json, []);
  copy.images = safeParse(original.images_json, []);
  copy.featured = 0;
  copy.status = 'for_sale';
  return insertProperty(copy);
}

function setStatus(id, status) { return updateProperty(id, { status }); }
function setFeatured(id, featured) { return updateProperty(id, { featured: !!featured }); }
function setArchived(id, archived) { return updateProperty(id, { archived: !!archived }); }
function reorder(idsInOrder) {
  const stmt = db.prepare('UPDATE properties SET sort_order = ? WHERE id = ?');
  const tx = db.transaction((ids) => { ids.forEach((id, i) => stmt.run(i, id)); });
  tx(idsInOrder);
}
function incrementViews(id) {
  db.prepare('UPDATE properties SET views = views + 1 WHERE id = ?').run(id);
}
function dashboardStats() {
  const total = db.prepare('SELECT COUNT(*) c FROM properties WHERE archived = 0').get().c;
  const featured = db.prepare('SELECT COUNT(*) c FROM properties WHERE archived = 0 AND featured = 1').get().c;
  const forSale = db.prepare("SELECT COUNT(*) c FROM properties WHERE archived = 0 AND status = 'for_sale'").get().c;
  const forRent = db.prepare("SELECT COUNT(*) c FROM properties WHERE archived = 0 AND status = 'for_rent'").get().c;
  const pending = db.prepare("SELECT COUNT(*) c FROM properties WHERE archived = 0 AND status = 'pending'").get().c;
  const sold = db.prepare("SELECT COUNT(*) c FROM properties WHERE archived = 0 AND status = 'sold'").get().c;
  const mostViewed = db.prepare('SELECT id, title, slug, views FROM properties WHERE archived = 0 ORDER BY views DESC LIMIT 5').all();
  return { total, featured, forSale, forRent, pending, sold, mostViewed };
}

module.exports = {
  db, slugify, uniqueSlug,
  listProperties, getPropertyBySlug, getPropertyById,
  insertProperty, updateProperty, deleteProperty, duplicateProperty,
  setStatus, setFeatured, setArchived, reorder, incrementViews, dashboardStats,
};
