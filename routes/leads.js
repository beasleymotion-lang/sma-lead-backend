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
// PUBLIC: Generic lead capture
// POST /api/leads
// Used by consultation, valuation, contact, newsletter and quiz forms.
// ============================================================

router.post('/leads', inquiryLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true });

    const body = req.body || {};
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const leadType = String(body.leadType || body.lead_type || 'consultation').trim().toLowerCase();
    const source = String(body.source || 'website').trim();

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
    }

    const safeType = ['buyer','seller','property_inquiry','valuation','consultation','newsletter'].includes(leadType)
      ? leadType
      : 'consultation';

    const notes = [
      body.intent ? `Interest: ${body.intent}` : '',
      body.budget ? `Budget: ${body.budget}` : '',
      body.timeline ? `Timeline: ${body.timeline}` : '',
      body.country ? `Country: ${body.country}` : '',
      body.propertyAddress ? `Property Address: ${body.propertyAddress}` : '',
      body.propertyType ? `Property Type: ${body.propertyType}` : '',
      body.bedrooms ? `Bedrooms: ${body.bedrooms}` : '',
      body.bathrooms ? `Bathrooms: ${body.bathrooms}` : '',
      body.constructionSize ? `Construction Size: ${body.constructionSize}` : '',
      body.lotSize ? `Lot Size: ${body.lotSize}` : '',
      body.message ? `Message: ${body.message}` : ''
    ].filter(Boolean).join('\n');

    const lead = crmDb.createLead({
      name: name || 'Website Lead',
      email,
      phone,
      source,
      lead_type: safeType,
      notes,
      property_title: body.propertyTitle || null,
      property_id: body.propertyId ? Number(body.propertyId) : null
    });

    const esc = (value) => String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const details = [
      `<strong>Name:</strong> ${esc(name || 'Not provided')}`,
      `<strong>Email:</strong> ${esc(email)}`,
      `<strong>Phone:</strong> ${esc(phone || 'Not provided')}`,
      `<strong>Lead type:</strong> ${esc(safeType)}`,
      `<strong>Source:</strong> ${esc(source)}`,
      notes ? `<strong>Details:</strong><br>${esc(notes).replace(/\n/g, '<br>')}` : ''
    ].filter(Boolean).join('<br><br>');

    const notificationEmail = process.env.LEAD_NOTIFICATION_EMAIL;
    const subject = `New ${safeType.replace(/_/g, ' ')} lead${name ? ` — ${name}` : ''}`;

    const emailJobs = [];
    if (notificationEmail) {
      emailJobs.push(sendEmail({
        to: notificationEmail,
        subject,
        html: `<h2>New Website Lead</h2>${details}<p><strong>Lead ID:</strong> ${esc(lead && lead.id)}</p>`
      }));
    }

    // Send a confirmation to the visitor for consultation/contact/valuation.
    // Newsletter subscribers get the same simple confirmation.
    emailJobs.push(sendEmail({
      to: email,
      subject: 'We received your request — Blaze Beasley Real Estate',
      html: `<p>Hi ${esc(name || 'there')},</p><p>Thank you for reaching out to Blaze Beasley Real Estate. We received your request and will follow up shortly.</p>${notes ? `<p>${esc(notes).replace(/\n/g, '<br>')}</p>` : ''}<p>— Blaze Beasley Real Estate</p>`
    }));

    const results = await Promise.allSettled(emailJobs);
    const visitorResult = results[results.length - 1];
    const internalFailed = results.slice(0, -1).some(r => r.status === 'rejected');

    if (internalFailed) console.error('[leads] internal notification email failed');
    if (visitorResult.status === 'rejected') {
      console.error('[leads] visitor confirmation email failed:', visitorResult.reason);
      return res.status(502).json({
        ok: false,
        leadId: lead && lead.id,
        error: 'Your information was saved, but the confirmation email could not be sent. Please try again or contact us directly.'
      });
    }

    return res.json({ ok: true, leadId: lead && lead.id });
  } catch (err) {
    console.error('[leads] generic lead failed:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or contact us directly.' });
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
