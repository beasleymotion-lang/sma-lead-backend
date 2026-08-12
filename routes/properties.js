// routes/properties.js
const express = require('express');
const propertiesDb = require('../lib/properties-db');
const { autofillSeoFields, generateStructuredData, generateOgTags, generateBreadcrumbs } = require('../lib/seo');
const { saveImages, deleteImage } = require('../lib/image-store');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ---------- Public read endpoints (no auth) ----------

// GET /api/properties?status=&neighborhood=&minPrice=&maxPrice=&bedrooms=&bathrooms=&propertyType=&featured=&sort=&search=
router.get('/properties', (req, res) => {
  const q = req.query;
  const results = propertiesDb.listProperties({
    status: q.status,
    neighborhood: q.neighborhood,
    minPrice: q.minPrice ? Number(q.minPrice) : undefined,
    maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
    bedrooms: q.bedrooms ? Number(q.bedrooms) : undefined,
    bathrooms: q.bathrooms ? Number(q.bathrooms) : undefined,
    propertyType: q.propertyType,
    featured: q.featured === 'true',
    sort: q.sort || 'newest',
    search: q.search,
  });
  res.json({ ok: true, properties: results });
});

// GET /api/properties/:slug — full detail + SEO payload, increments view count
router.get('/properties/:slug', (req, res) => {
  const property = propertiesDb.getPropertyBySlug(req.params.slug);
  if (!property || property.archived) return res.status(404).json({ ok: false, error: 'Property not found.' });
  propertiesDb.incrementViews(property.id);
  res.json({
    ok: true,
    property,
    seo: {
      title: property.seo_title,
      metaDescription: property.meta_description,
      og: generateOgTags(property),
      structuredData: generateStructuredData(property),
      breadcrumbs: generateBreadcrumbs(property),
    },
  });
});

// ---------- Admin write endpoints (auth required) ----------

router.post('/admin/properties', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    let images = body.images || [];
    // If the client sent raw base64 data URIs (new uploads), save them to disk first.
    if (body.newImageUploads && body.newImageUploads.length) {
      const saved = await saveImages(body.newImageUploads);
      images = [...images, ...saved];
    }
    const withSeo = autofillSeoFields({ ...body, images });
    const property = propertiesDb.insertProperty(withSeo);
    res.json({ ok: true, property, urlSlug: `/properties/${property.slug}` });
  } catch (err) {
    console.error('[properties] create failed:', err);
    res.status(400).json({ ok: false, error: err.message || 'Could not create property.' });
  }
});

router.put('/admin/properties/:id', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    let images = body.images || [];
    if (body.newImageUploads && body.newImageUploads.length) {
      const saved = await saveImages(body.newImageUploads);
      images = [...images, ...saved];
    }
    const withSeo = autofillSeoFields({ ...body, images });
    const property = propertiesDb.updateProperty(Number(req.params.id), withSeo);
    if (!property) return res.status(404).json({ ok: false, error: 'Property not found.' });
    res.json({ ok: true, property });
  } catch (err) {
    console.error('[properties] update failed:', err);
    res.status(400).json({ ok: false, error: err.message || 'Could not update property.' });
  }
});

router.delete('/admin/properties/:id', requireAuth, (req, res) => {
  const property = propertiesDb.getPropertyById(Number(req.params.id));
  if (property) (property.images || []).forEach((img) => deleteImage(img.url));
  const deleted = propertiesDb.deleteProperty(Number(req.params.id));
  res.json({ ok: deleted });
});

router.post('/admin/properties/:id/duplicate', requireAuth, (req, res) => {
  const property = propertiesDb.duplicateProperty(Number(req.params.id));
  if (!property) return res.status(404).json({ ok: false, error: 'Property not found.' });
  res.json({ ok: true, property });
});

router.post('/admin/properties/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!['for_sale', 'for_rent', 'pending', 'sold'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'Invalid status.' });
  }
  const property = propertiesDb.setStatus(Number(req.params.id), status);
  res.json({ ok: !!property, property });
});

router.post('/admin/properties/:id/featured', requireAuth, (req, res) => {
  const property = propertiesDb.setFeatured(Number(req.params.id), !!req.body.featured);
  res.json({ ok: !!property, property });
});

router.post('/admin/properties/:id/archive', requireAuth, (req, res) => {
  const property = propertiesDb.setArchived(Number(req.params.id), req.body.archived !== false);
  res.json({ ok: !!property, property });
});

router.post('/admin/properties/reorder', requireAuth, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ ok: false, error: 'ids must be an array.' });
  propertiesDb.reorder(ids);
  res.json({ ok: true });
});

router.get('/admin/dashboard-stats', requireAuth, (req, res) => {
  res.json({ ok: true, stats: propertiesDb.dashboardStats() });
});

module.exports = router;
