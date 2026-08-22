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
      source: 'website_inquiry',
      lead_type: 'property_inquiry',
      notes: message || null
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
      return res.status(502).json({ ok: false, leadId: lead.id, error: 'Your inquiry was saved, but the confirmation email could not be sent. Please try again.' });
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
// PUBLIC: General lead capture
// POST /api/leads
// Used by consultation, valuation, contact, quiz, newsletter,
// popup, and showing forms. Saves to the same CRM used by admin.
// ============================================================
router.post('/leads', inquiryLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true });

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const phone = String(req.body.phone || '').trim();
    const leadType = String(req.body.leadType || 'consultation').trim().toLowerCase();
    const source = String(req.body.source || 'website').trim();
    const propertySlug = String(req.body.propertySlug || '').trim();
    const propertyTitle = String(req.body.propertyTitle || '').trim();

    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please provide your name and a valid email.' });
    }

    const property = propertySlug ? await propertiesDb.getPropertyBySlug(propertySlug) : null;
    const details = {
      lead_type: leadType,
      intent: req.body.intent || null,
      budget: req.body.budget || null,
      timeline: req.body.timeline || null,
      country: req.body.country || null,
      address: req.body.address || null,
      property_type: req.body.propertyType || null,
      bedrooms: req.body.bedrooms || null,
      bathrooms: req.body.bathrooms || null,
      lot_size: req.body.lotSize || null,
      message: req.body.message || null
    };
    const notes = Object.entries(details)
      .filter(([,v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k,v]) => `${k}: ${v}`)
      .join('\n');

    const lead = crmDb.createLead({
      name,
      email,
      phone,
      property_id: property ? property.id : null,
      property_title: property ? property.title : (propertyTitle || null),
      source,
      lead_type: leadType,
      notes,
      budget: req.body.budget || null
    });

    const internalHtml = `
      <h2>New ${leadType.replace(/_/g, ' ')} lead</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
      <p><strong>Source:</strong> ${escapeHtml(source)}</p>
      <p><strong>Property:</strong> ${escapeHtml(property?.title || propertyTitle || 'Not specified')}</p>
      <pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${escapeHtml(notes || 'No additional details')}</pre>`;

    const visitorHtml = `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for reaching out to Blaze Beasley Real Estate. Your request has been received.</p>
      <p>We'll follow up with you personally regarding your request.</p>
      <p>— Blaze Beasley Real Estate</p>`;

    const [visitorResult, internalResult] = await Promise.allSettled([
      sendEmail({ to: email, subject: 'We received your request — Blaze Beasley Real Estate', html: visitorHtml }),
      sendEmail({ subject: `New website lead: ${name}`, html: internalHtml })
    ]);

    if (visitorResult.status === 'rejected') {
      console.error('[leads] visitor email failed:', visitorResult.reason);
      return res.status(502).json({ ok: false, leadId: lead.id, error: 'Your information was saved, but we could not send the confirmation email. Please try again.' });
    }
    if (internalResult.status === 'rejected') {
      console.error('[leads] internal email failed:', internalResult.reason);
    }

    return res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error('[leads] general lead failed:', err);
    return res.status(500).json({ ok: false, error: 'Unable to submit your request right now.' });
  }
});

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
