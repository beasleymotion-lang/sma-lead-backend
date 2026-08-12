// routes/leads.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const crmDb = require('../lib/crm-db');
const propertiesDb = require('../lib/properties-db');
const { requireAuth } = require('../lib/auth');
const { sendEmail } = require('../lib/email');
const { propertyInquiryVisitorEmail, propertyInquiryInternalEmail } = require('../lib/property-inquiry-email');

const router = express.Router();

const inquiryLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again shortly.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------- Public: property inquiry form on the website ----------
router.post('/property-inquiry', inquiryLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true }); // honeypot

    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const phone = (req.body.phone || '').trim();
    const message = (req.body.message || '').trim();
    const propertySlug = (req.body.propertySlug || '').trim();

    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please provide your name and a valid email.' });
    }

    const property = propertySlug ? propertiesDb.getPropertyBySlug(propertySlug) : null;

    const lead = crmDb.createLead({
      name, email, phone,
      property_id: property ? property.id : null,
      property_title: property ? property.title : (req.body.propertyTitle || null),
      source: 'website_inquiry',
    });

    const [visitorResult, internalResult] = await Promise.allSettled([
      sendEmail({ ...propertyInquiryVisitorEmail({ name, property, message }), to: email }),
      sendEmail({ ...propertyInquiryInternalEmail({ name, email, phone, property, message, timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }) }) }),
    ]);
    if (visitorResult.status === 'rejected') console.error('[leads] visitor email failed:', visitorResult.reason);
    if (internalResult.status === 'rejected') console.error('[leads] internal email failed:', internalResult.reason);

    res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error('[leads] inquiry failed:', err);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or contact us directly.' });
  }
});

// ---------- Admin: CRM ----------
router.get('/admin/leads', requireAuth, (req, res) => {
  const { stage, search } = req.query;
  res.json({ ok: true, leads: crmDb.listLeads({ stage, search }) });
});

router.put('/admin/leads/:id', requireAuth, (req, res) => {
  const lead = crmDb.updateLead(Number(req.params.id), req.body || {});
  if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found.' });
  res.json({ ok: true, lead });
});

router.get('/admin/leads-recent', requireAuth, (req, res) => {
  res.json({ ok: true, leads: crmDb.recentLeads(5) });
});

module.exports = router;
