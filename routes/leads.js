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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again shortly.' }
});

function clean(v) { return v == null ? '' : String(v).trim(); }
function esc(v) {
  return clean(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function saveLead({ name, email, phone, source, propertyId, propertyTitle, details }) {
  const lead = crmDb.createLead({
    name, email, phone,
    property_id: propertyId || null,
    property_title: propertyTitle || null,
    source: source || 'website'
  });
  if (details) {
    try {
      crmDb.updateLead(lead.id, { notes: details });
    } catch (err) {
      console.error('[leads] Could not save lead details:', err);
    }
  }
  return crmDb.getLead(lead.id) || lead;
}

function requireEmailConfig() {
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) {
    throw new Error('Email delivery is not configured. Add RESEND_API_KEY and FROM_EMAIL in Render.');
  }
}

// PUBLIC: generic lead endpoint used by consultation, valuation, contact,
// newsletter, popup, quiz and showing forms.
router.post('/leads', publicLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true });

    const name = clean(req.body.name || `${clean(req.body.firstName)} ${clean(req.body.lastName)}`).trim();
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone);
    const source = clean(req.body.source) || 'website';
    const leadType = clean(req.body.leadType) || 'consultation';

    if (!name || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Please provide your name and a valid email.' });
    }

    const details = [
      `Lead type: ${leadType}`,
      req.body.intent ? `Interest: ${clean(req.body.intent)}` : '',
      req.body.budget ? `Budget: ${clean(req.body.budget)}` : '',
      req.body.timeline ? `Timeline: ${clean(req.body.timeline)}` : '',
      req.body.address ? `Property address: ${clean(req.body.address)}` : '',
      req.body.propertyTitle ? `Property: ${clean(req.body.propertyTitle)}` : '',
      req.body.date ? `Preferred date: ${clean(req.body.date)}` : '',
      req.body.time ? `Preferred time: ${clean(req.body.time)}` : '',
      req.body.country ? `Country: ${clean(req.body.country)}` : '',
      req.body.interest ? `Interested in: ${clean(req.body.interest)}` : '',
      req.body.message ? `Message: ${clean(req.body.message)}` : ''
    ].filter(Boolean).join('\n');

    const lead = await saveLead({
      name, email, phone, source,
      propertyId: req.body.propertyId,
      propertyTitle: req.body.propertyTitle,
      details
    });

    requireEmailConfig();
    const subject = `New ${leadType.replace(/_/g, ' ')} lead — ${name}`;
    const html = `<div style="font-family:Arial,sans-serif"><h2>New Website Lead</h2><p><b>Name:</b> ${esc(name)}</p><p><b>Email:</b> ${esc(email)}</p><p><b>Phone:</b> ${esc(phone || 'Not provided')}</p><p><b>Type:</b> ${esc(leadType)}</p><pre style="white-space:pre-wrap;font-family:Arial">${esc(details)}</pre><p>Lead ID: ${esc(lead.id)}</p></div>`;
    const visitorHtml = `<div style="font-family:Arial,sans-serif"><h2>Thanks, ${esc(name.split(' ')[0])}.</h2><p>We received your request and will follow up personally.</p><p>If you need us sooner, reply to this email or call +1 (210) 915-7177.</p></div>`;

    const [internalResult, visitorResult] = await Promise.allSettled([
      sendEmail({ to: process.env.NOTIFY_EMAIL || 'beasleymotion@gmail.com', subject, html }),
      sendEmail({ to: email, subject: 'We received your San Miguel request', html: visitorHtml })
    ]);

    if (internalResult.status === 'rejected') console.error('[leads] internal email failed:', internalResult.reason);
    if (visitorResult.status === 'rejected') {
      console.error('[leads] visitor email failed:', visitorResult.reason);
      return res.status(502).json({ ok: false, leadId: lead.id, error: 'Your request was saved, but the confirmation email could not be sent. Please try again or call us directly.' });
    }

    return res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error('[leads] generic lead failed:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Could not submit your request.' });
  }
});

// PUBLIC: Property inquiry form
router.post('/property-inquiry', publicLimiter, async (req, res) => {
  try {
    if (req.body.company) return res.json({ ok: true });
    const name = clean(req.body.name);
    const email = clean(req.body.email).toLowerCase();
    const phone = clean(req.body.phone);
    const message = clean(req.body.message);
    const propertySlug = clean(req.body.propertySlug);
    if (!name || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'Please provide your name and a valid email.' });
    const property = propertySlug ? await propertiesDb.getPropertyBySlug(propertySlug) : null;
    const lead = await saveLead({
      name, email, phone,
      propertyId: property ? property.id : null,
      propertyTitle: property ? property.title : clean(req.body.propertyTitle),
      source: 'website_inquiry',
      details: [`Lead type: property_inquiry`, `Property: ${property ? property.title : clean(req.body.propertyTitle) || 'Not specified'}`, message ? `Message: ${message}` : ''].filter(Boolean).join('\n')
    });
    requireEmailConfig();
    const [visitorResult, internalResult] = await Promise.allSettled([
      sendEmail({ ...propertyInquiryVisitorEmail({ name, property, message }), to: email }),
      sendEmail({ ...propertyInquiryInternalEmail({ name, email, phone, property, message, timestamp: new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }) }) })
    ]);
    if (internalResult.status === 'rejected') console.error('[leads] internal property email failed:', internalResult.reason);
    if (visitorResult.status === 'rejected') return res.status(502).json({ ok: false, leadId: lead.id, error: 'Your inquiry was saved, but the confirmation email could not be sent.' });
    return res.json({ ok: true, leadId: lead.id });
  } catch (err) {
    console.error('[leads] inquiry failed:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Something went wrong. Please try again.' });
  }
});

// ADMIN: CRM
router.get('/admin/leads', requireAuth, (req, res) => {
  try {
    const { stage, search } = req.query;
    return res.json({ ok: true, leads: crmDb.listLeads({ stage, search }) });
  } catch (err) {
    console.error('[leads] list failed:', err);
    return res.status(500).json({ ok: false, error: 'Could not load leads.' });
  }
});

router.put('/admin/leads/:id', requireAuth, (req, res) => {
  try {
    const lead = crmDb.updateLead(Number(req.params.id), req.body || {});
    if (!lead) return res.status(404).json({ ok: false, error: 'Lead not found.' });
    return res.json({ ok: true, lead });
  } catch (err) {
    console.error('[leads] update failed:', err);
    return res.status(400).json({ ok: false, error: err.message || 'Could not update lead.' });
  }
});

router.get('/admin/leads-recent', requireAuth, (req, res) => {
  try { return res.json({ ok: true, leads: crmDb.recentLeads(5) }); }
  catch (err) { return res.status(500).json({ ok: false, error: 'Could not load recent leads.' }); }
});

module.exports = router;
