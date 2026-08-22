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
// PUBLIC: General website lead forms
// POST /api/leads
// ============================================================
router.post('/leads', inquiryLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true });
    const body = req.body || {};
    const name = String(body.name || `${body.firstName || ''} ${body.lastName || ''}`).trim();
    const email = String(body.email || '').trim().toLowerCase();
    const phone = String(body.phone || '').trim();
    const source = String(body.source || body.leadType || 'website').trim();
    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok:false, error:'Please provide your name and a valid email.' });
    }

    let property = null;
    const propertySlug = String(body.propertySlug || '').trim();
    if (propertySlug) property = await propertiesDb.getPropertyBySlug(propertySlug);

    const details = Object.entries(body)
      .filter(([k,v]) => v != null && v !== '' && !['name','firstName','lastName','email','phone','company'].includes(k))
      .map(([k,v]) => `${k}: ${String(v)}`)
      .join('\n');

    const lead = crmDb.createLead({
      name,
      email,
      phone,
      property_id: property ? property.id : null,
      property_title: property ? property.title : (body.propertyTitle || null),
      source: source || 'website'
    });
    if (details) crmDb.updateLead(lead.id, { notes: details });

    const notificationTo = process.env.LEAD_NOTIFICATION_EMAIL || process.env.NOTIFY_EMAIL;
    const jobs = [];
    if (notificationTo) {
      jobs.push(sendEmail({
        to: notificationTo,
        subject: `New ${source.replace(/_/g,' ')} lead — ${name}`,
        html: `<h2>New website lead</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || 'Not provided'}</p><p><strong>Source:</strong> ${source}</p><pre>${details.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</pre>`
      }));
    }
    jobs.push(sendEmail({
      to: email,
      subject: 'We received your request — Blaze Beasley Real Estate',
      html: `<p>Hi ${name.split(/\s+/)[0]},</p><p>Thank you for reaching out to Blaze Beasley Real Estate. Your request has been received and we’ll follow up shortly.</p><p>— Blaze Beasley</p>`
    }));
    const results = await Promise.allSettled(jobs);
    const failed = results.find(r => r.status === 'rejected');
    if (failed) {
      console.error('[leads] email delivery failed:', failed.reason);
      return res.status(502).json({ ok:false, leadId:lead.id, error:'Your request was saved, but the confirmation email could not be sent. Please try again or contact us directly.' });
    }
    return res.json({ ok:true, leadId:lead.id });
  } catch (err) {
    console.error('[leads] general lead failed:', err);
    return res.status(500).json({ ok:false, error:'Something went wrong. Please try again.' });
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
