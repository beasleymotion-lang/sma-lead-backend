// routes/properties.js
const express = require('express');
const propertiesDb = require('../lib/properties-db');

const {
  autofillSeoFields,
  generateStructuredData,
  generateOgTags,
  generateBreadcrumbs,
  generatePropertyKeywords
} = require('../lib/seo');

const { saveImages, deleteImage } = require('../lib/image-store');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============================================================
// PUBLIC PROPERTY ENDPOINTS
// ============================================================

// GET /api/properties
router.get('/properties', async (req, res) => {
  try {
    const q = req.query;

    const properties = await propertiesDb.listProperties({
      status: q.status,
      neighborhood: q.neighborhood,
      minPrice: q.minPrice ? Number(q.minPrice) : undefined,
      maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
      bedrooms: q.bedrooms ? Number(q.bedrooms) : undefined,
      bathrooms: q.bathrooms ? Number(q.bathrooms) : undefined,
      propertyType: q.propertyType,
      featured: q.featured === 'true',
      sort: q.sort || 'newest',
      search: q.search
    });

    res.json({
      ok: true,
      properties
    });
  } catch (err) {
    console.error('[properties] list failed:', err);

    res.status(500).json({
      ok: false,
      error: err.message || 'Could not load properties.'
    });
  }
});

// GET /api/properties/:slug
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
        keywords: generatePropertyKeywords(property)
      }
    });
  } catch (err) {
    console.error('[properties] detail failed:', err);

    res.status(500).json({
      ok: false,
      error: err.message || 'Could not load property.'
    });
  }
});

// ============================================================
// ADMIN PROPERTY ENDPOINTS
// ============================================================

// CREATE PROPERTY
// POST /api/admin/properties
router.post('/admin/properties', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};

    let images = Array.isArray(body.images) ? body.images : [];

    if (Array.isArray(body.newImageUploads) && body.newImageUploads.length > 0) {
      const saved = await saveImages(body.newImageUploads);
      images = [...images, ...saved];
    }

    const withSeo = autofillSeoFields({
      ...body,
      images
    });

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

// UPDATE PROPERTY
// PUT /api/admin/properties/:id
router.put('/admin/properties/:id', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};

    const existing = await propertiesDb.getPropertyById(Number(req.params.id));
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'Property not found.' });
    }

    let images = Array.isArray(body.images) ? body.images : existing.images;

    if (Array.isArray(body.newImageUploads) && body.newImageUploads.length > 0) {
      const saved = await saveImages(body.newImageUploads);
      images = [...images, ...saved];
    }

    const withSeo = autofillSeoFields({
      ...body,
      images
    });

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

    res.json({
      ok: true,
      property
    });
  } catch (err) {
    console.error('[properties] update failed:', err);

    res.status(400).json({
      ok: false,
      error: err.message || 'Could not update property.'
    });
  }
});

// UPLOAD PROPERTY IMAGE BATCH
// POST /api/admin/properties/:id/images
// Uploads a small batch so a large 15-20 photo gallery never has to travel
// in one oversized request. Photos are stored permanently in Supabase Storage.
router.post('/admin/properties/:id/images', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const property = await propertiesDb.getPropertyById(id);
    if (!property) return res.status(404).json({ ok: false, error: 'Property not found.' });

    const uploads = Array.isArray(req.body?.newImageUploads) ? req.body.newImageUploads : [];
    if (!uploads.length) return res.status(400).json({ ok: false, error: 'No images supplied.' });
    if (uploads.length > 5) return res.status(400).json({ ok: false, error: 'Upload at most 5 photos per batch.' });

    const existing = Array.isArray(property.images) ? property.images : [];
    if (existing.length + uploads.length > 20) {
      return res.status(400).json({ ok: false, error: 'A listing can contain up to 20 photos.' });
    }

    const saved = await saveImages(uploads);
    const images = [...existing, ...saved].map((img, index) => ({ ...img, order: index })).slice(0, 20);
    const updated = await propertiesDb.updateProperty(id, { images });

    res.json({ ok: true, images: updated.images || images, savedImages: saved, property: updated });
  } catch (err) {
    console.error('[properties] image batch upload failed:', err);
    res.status(400).json({ ok: false, error: err.message || 'Could not upload property photos.' });
  }
});

// DELETE PROPERTY
// DELETE /api/admin/properties/:id
router.delete('/admin/properties/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const property = await propertiesDb.getPropertyById(id);

    if (property && Array.isArray(property.images)) {
      for (const img of property.images) {
        if (img && img.url) {
          await deleteImage(img.url);
        }
      }
    }

    const deleted = await propertiesDb.deleteProperty(id);

    res.json({
      ok: deleted
    });
  } catch (err) {
    console.error('[properties] delete failed:', err);

    res.status(400).json({
      ok: false,
      error: err.message || 'Could not delete property.'
    });
  }
});

// DUPLICATE PROPERTY
// POST /api/admin/properties/:id/duplicate
router.post(
  '/admin/properties/:id/duplicate',
  requireAuth,
  async (req, res) => {
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

      res.json({
        ok: true,
        property
      });
    } catch (err) {
      console.error('[properties] duplicate failed:', err);

      res.status(400).json({
        ok: false,
        error: err.message || 'Could not duplicate property.'
      });
    }
  }
);

// CHANGE STATUS
// POST /api/admin/properties/:id/status
router.post(
  '/admin/properties/:id/status',
  requireAuth,
  async (req, res) => {
    try {
      const { status } = req.body || {};

      const validStatuses = [
        'for_sale',
        'for_rent',
        'pending',
        'sold'
      ];

      if (!validStatuses.includes(status)) {
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
  }
);

// FEATURE / UNFEATURE
// POST /api/admin/properties/:id/featured
router.post(
  '/admin/properties/:id/featured',
  requireAuth,
  async (req, res) => {
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
  }
);

// ARCHIVE / UNARCHIVE
// POST /api/admin/properties/:id/archive
router.post(
  '/admin/properties/:id/archive',
  requireAuth,
  async (req, res) => {
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
  }
);

// REORDER PROPERTIES
// POST /api/admin/properties/reorder
router.post(
  '/admin/properties/reorder',
  requireAuth,
  async (req, res) => {
    try {
      const { ids } = req.body || {};

      if (!Array.isArray(ids)) {
        return res.status(400).json({
          ok: false,
          error: 'ids must be an array.'
        });
      }

      await propertiesDb.reorder(ids);

      res.json({
        ok: true
      });
    } catch (err) {
      console.error('[properties] reorder failed:', err);

      res.status(400).json({
        ok: false,
        error: err.message || 'Could not reorder properties.'
      });
    }
  }
);

// DASHBOARD STATISTICS
// GET /api/admin/dashboard-stats
router.get(
  '/admin/dashboard-stats',
  requireAuth,
  async (req, res) => {
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
  }
);

module.exports = router;
