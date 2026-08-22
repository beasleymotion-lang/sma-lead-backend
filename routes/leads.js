// routes/leads.js

const express = require('express');
const rateLimit = require('express-rate-limit');

const crmDb = require('../lib/crm-db');
const propertiesDb = require('../lib/properties-db');
const { requireAuth } = require('../lib/auth');
const { sendEmail } = require('../lib/email');

const {
  propertyInquiryVisitorEmail,
  propertyInquiryInternalEmail
} = require('../lib/property-inquiry-email');

const router = express.Router();

const inquiryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'Too many requests. Please try again shortly.'
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// ============================================================
// PUBLIC: Consultation / showing lead form
// POST /api/lead-request
// ============================================================
router.post('/lead-request', inquiryLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true });

    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const phone = (req.body.phone || '').trim();
    const leadType = (req.body.leadType || 'consultation').trim().toLowerCase();
    const intent = (req.body.intent || '').trim();
    const timeline = (req.body.timeline || '').trim();
    const message = (req.body.message || '').trim();
    const propertyTitle = (req.body.propertyTitle || '').trim();
    const propertySlug = (req.body.propertySlug || '').trim();
    const preferredDate = (req.body.preferredDate || '').trim();

    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please provide your name and a valid email.' });
    }

    const property = propertySlug ? await propertiesDb.getPropertyBySlug(propertySlug) : null;
    const normalizedType = ['consultation','showing','valuation'].includes(leadType) ? leadType : 'consultation';
    const noteLines = [
      `Lead type: ${normalizedType}`,
      intent ? `Interest: ${intent}` : '',
      timeline ? `Timeline: ${timeline}` : '',
      preferredDate ? `Preferred showing date: ${preferredDate}` : '',
      message ? `Message: ${message}` : '',
    ].filter(Boolean);

    const lead = crmDb.createLead({
      name,
      email,
      phone,
      property_id: property ? property.id : null,
      property_title: property ? property.title : (propertyTitle || null),
      source: `website_${normalizedType}`
    });

    crmDb.updateLead(lead.id, {
      notes: noteLines.join('\n'),
      tags: [normalizedType, intent].filter(Boolean)
    });

    const internalMessage = [
      `<strong>Lead type:</strong> ${normalizedType}`,
      intent ? `<strong>Interest:</strong> ${intent}` : '',
      timeline ? `<strong>Timeline:</strong> ${timeline}` : '',
      preferredDate ? `<strong>Preferred showing date:</strong> ${preferredDate}` : '',
      property?.title || propertyTitle ? `<strong>Property:</strong> ${property?.title || propertyTitle}` : '',
      message ? `<strong>Message:</strong><br>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}` : ''
    ].filter(Boolean).join('<br><br>');

    const [visitorResult, internalResult] = await Promise.allSettled([
      sendEmail({
        ...propertyInquiryVisitorEmail({
          name,
          property,
          message: `Thank you for reaching out about a ${normalizedType}. ${message}`
        }),
        to: email
      }),
      sendEmail({
        ...propertyInquiryInternalEmail({
          name,
          email,
          phone,
          property,
          message: internalMessage,
          timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' })
        })
      })
    ]);

    if (visitorResult.status === 'rejected') console.error('[lead-request] visitor email failed:', visitorResult.reason);
    if (internalResult.status === 'rejected') console.error('[lead-request] internal email failed:', internalResult.reason);

    return res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error('[lead-request] failed:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or contact us directly.' });
  }
});


// ============================================================
// PUBLIC: Property inquiry form
// POST /api/property-inquiry
// ============================================================

router.post('/property-inquiry', inquiryLimiter, async (req, res) => {
  try {
    // Honeypot spam protection
    if (req.body.company) {
      return res.json({ ok: true });
    }

    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const phone = (req.body.phone || '').trim();
    const message = (req.body.message || '').trim();
    const propertySlug = (req.body.propertySlug || '').trim();

    // Validate required fields
    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({
        ok: false,
        error: 'Please provide your name and a valid email.'
      });
    }

    // Look up the property in Supabase.
    // IMPORTANT: getPropertyBySlug is async.
    const property = propertySlug
      ? await propertiesDb.getPropertyBySlug(propertySlug)
      : null;

    // Create the lead in the CRM
    const lead = crmDb.createLead({
      name,
      email,
      phone,
      property_id: property ? property.id : null,
      property_title: property
        ? property.title
        : (req.body.propertyTitle || null),
      source: 'website_inquiry'
    });

    // Send visitor + internal notification emails.
    // Email failures do NOT prevent the lead from being saved.
    const [visitorResult, internalResult] = await Promise.allSettled([
      sendEmail({
        ...propertyInquiryVisitorEmail({
          name,
          property,
          message
        }),
        to: email
      }),

      sendEmail({
        ...propertyInquiryInternalEmail({
          name,
          email,
          phone,
          property,
          message,
          timestamp: new Date().toLocaleString('en-US', {
            timeZone: 'America/Mexico_City'
          })
        })
      })
    ]);

    if (visitorResult.status === 'rejected') {
      console.error(
        '[leads] visitor email failed:',
        visitorResult.reason
      );
    }

    if (internalResult.status === 'rejected') {
      console.error(
        '[leads] internal email failed:',
        internalResult.reason
      );
    }

    return res.json({
      ok: true,
      leadId: lead.id
    });

  } catch (err) {
    console.error('[leads] inquiry failed:', err);

    return res.status(500).json({
      ok: false,
      error:
        'Something went wrong. Please try again or contact us directly.'
    });
  }
});


// ============================================================
// ADMIN: CRM
// ============================================================

// GET /api/admin/leads
router.get('/admin/leads', requireAuth, (req, res) => {
  try {
    const { stage, search } = req.query;

    const leads = crmDb.listLeads({
      stage,
      search
    });

    return res.json({
      ok: true,
      leads
    });

  } catch (err) {
    console.error('[leads] list failed:', err);

    return res.status(500).json({
      ok: false,
      error: 'Could not load leads.'
    });
  }
});


// PUT /api/admin/leads/:id
router.put('/admin/leads/:id', requireAuth, (req, res) => {
  try {
    const lead = crmDb.updateLead(
      Number(req.params.id),
      req.body || {}
    );

    if (!lead) {
      return res.status(404).json({
        ok: false,
        error: 'Lead not found.'
      });
    }

    return res.json({
      ok: true,
      lead
    });

  } catch (err) {
    console.error('[leads] update failed:', err);

    return res.status(400).json({
      ok: false,
      error: err.message || 'Could not update lead.'
    });
  }
});


// GET /api/admin/leads-recent
router.get('/admin/leads-recent', requireAuth, (req, res) => {
  try {
    const leads = crmDb.recentLeads(5);

    return res.json({
      ok: true,
      leads
    });

  } catch (err) {
    console.error('[leads] recent failed:', err);

    return res.status(500).json({
      ok: false,
      error: 'Could not load recent leads.'
    });
  }
});


module.exports = router;
