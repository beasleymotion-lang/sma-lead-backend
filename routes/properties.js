// routes/properties.js
const express = require('express');
const propertiesDb = require('../lib/properties-db');
const {
  autofillSeoFields,
  generateStructuredData,
  generateOgTags,
  generateBreadcrumbs
} = require('../lib/seo');
const { saveImages, deleteImage } = require('../lib/image-store');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ---------- Public read endpoints ----------

router.get('/properties', async (req, res) => {
  try {
    const q = req.query;

    const results = await propertiesDb.listProperties({
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
  } catch (err) {
    console.error('[properties] list failed:', err);
    res.status(500).json({
      ok: false,
      error: err.message || 'Could not load properties.'
    });
  }
});

router.get('/properties/:slug', async (req, res) => {
  try {
    const property = await propertiesDb.getPropertyBySlug(req.params.slug);

    if (!property || property.archived) {
      return res.status(404).json({
        ok: false,
        error: 'Property not found.'
      });
    }

    await propertiesDb.incrementViews(property.id);

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
  } catch (err) {
    console.error('[properties] detail failed:', err);
    res.status(500).json({
      ok: false,
      error: err.message || 'Could not load property.'
    });
  }
});

// ---------- Admin write endpoints ----------

router.post('/admin/properties', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    let images = body.images || [];

    if (body.newImageUploads && body.newImageUploads.length) {
      const saved = await saveImages(body.newImageUploads);
      images = [...images, ...saved];
    }

    const withSeo = autofillSeoFields({ ...body, images });
    const property = await propertiesDb.insertProperty(withSeo);

    res.json({
      ok: true,
      property,
      urlSlug: `/properties/${property.slug}`
    });
  } catch (err) {
    console.error('[properties] create failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not create property.'
    });
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

    const property = await propertiesDb.updateProperty(
      Number(req.params.id),
      withSeo
    );

    if (!property) {
      return res.status(404).json({
        ok: false,
        error: 'Property not found.'
      });
    }

    res.json({ ok: true, property });
  } catch (err) {
    console.error('[properties] update failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not update property.'
    });
  }
});

router.delete('/admin/properties/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const property = await propertiesDb.getPropertyById(id);

    if (property) {
      for (const img of property.images || []) {
        await deleteImage(img.url);
      }
    }

    const deleted = await propertiesDb.deleteProperty(id);

    res.json({ ok: deleted });
  } catch (err) {
    console.error('[properties] delete failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not delete property.'
    });
  }
});

router.post('/admin/properties/:id/duplicate', requireAuth, async (req, res) => {
  try {
    const property = await propertiesDb.duplicateProperty(
      Number(req.params.id)
    );

    if (!property) {
      return res.status(404).json({
        ok: false,
        error: 'Property not found.'
      });
    }

    res.json({ ok: true, property });
  } catch (err) {
    console.error('[properties] duplicate failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not duplicate property.'
    });
  }
});

router.post('/admin/properties/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body || {};

    if (!['for_sale', 'for_rent', 'pending', 'sold'].includes(status)) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid status.'
      });
    }

    const property = await propertiesDb.setStatus(
      Number(req.params.id),
      status
    );

    res.json({
      ok: !!property,
      property
    });
  } catch (err) {
    console.error('[properties] status failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not update status.'
    });
  }
});

router.post('/admin/properties/:id/featured', requireAuth, async (req, res) => {
  try {
    const property = await propertiesDb.setFeatured(
      Number(req.params.id),
      !!req.body.featured
    );

    res.json({
      ok: !!property,
      property
    });
  } catch (err) {
    console.error('[properties] featured failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not update featured status.'
    });
  }
});

router.post('/admin/properties/:id/archive', requireAuth, async (req, res) => {
  try {
    const property = await propertiesDb.setArchived(
      Number(req.params.id),
      req.body.archived !== false
    );

    res.json({
      ok: !!property,
      property
    });
  } catch (err) {
    console.error('[properties] archive failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not archive property.'
    });
  }
});

router.post('/admin/properties/reorder', requireAuth, async (req, res) => {
  try {
    const { ids } = req.body || {};

    if (!Array.isArray(ids)) {
      return res.status(400).json({
        ok: false,
        error: 'ids must be an array.'
      });
    }

    await propertiesDb.reorder(ids);

    res.json({ ok: true });
  } catch (err) {
    console.error('[properties] reorder failed:', err);
    res.status(400).json({
      ok: false,
      error: err.message || 'Could not reorder properties.'
    });
  }
});

router.get('/admin/dashboard-stats', requireAuth, async (req, res) => {
  try {
    const stats = await propertiesDb.dashboardStats();

    res.json({
      ok: true,
      stats
    });
  } catch (err) {
    console.error('[properties] dashboard stats failed:', err);
    res.status(500).json({
      ok: false,
      error: err.message || 'Could not load dashboard statistics.'
    });
  }
});

module.exports = router;
