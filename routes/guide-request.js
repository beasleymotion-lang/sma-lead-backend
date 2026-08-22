// routes/guide-request.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { insertLead, scheduleNurtureSequence, findRecentLeadByEmail } = require('../lib/db');
const { guideDeliveryEmail, internalLeadNotification, sendEmail, GUIDE_META } = require('../lib/email');
const crmDb = require('../lib/crm-db');

const router = express.Router();

// --- Spam protection: rate limit + honeypot field ---
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 8,                    // 8 submissions per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please try again shortly.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GUIDES = Object.keys(GUIDE_META);
const VALID_INTENTS = ['buying', 'selling', 'both'];

function validate(body) {
  const errors = [];
  const firstName = (body.firstName || '').trim();
  const lastName = (body.lastName || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  const intent = (body.intent || '').trim().toLowerCase();
  const budget = (body.budget || '').trim();
  const guide = (body.guide || 'buyer').trim().toLowerCase();

  if (!firstName) errors.push('First name is required.');
  if (!lastName) errors.push('Last name is required.');
  if (!email || !EMAIL_RE.test(email)) errors.push('A valid email is required.');
  if (!VALID_INTENTS.includes(intent)) errors.push('Please specify buying, selling, or both.');
  if (!VALID_GUIDES.includes(guide)) errors.push('Unknown guide requested.');

  return { errors, clean: { firstName, lastName, email, phone, intent, budget, guide } };
}

router.post('/guide-request', limiter, async (req, res) => {
  try {
    // Honeypot: a hidden field named "company" that real users never fill in.
    // Bots that auto-fill every field will trip this and get a fake-success response.
    if (req.body.company) {
      return res.json({ ok: true }); // silently pretend success, do nothing
    }

    const { errors, clean } = validate(req.body);
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors.join(' ') });
    }

    // Basic duplicate-submission guard (same email within 2 minutes = likely a double-click)
    const recent = findRecentLeadByEmail(clean.email, 2);
    if (recent) {
      return res.json({ ok: true, deduped: true });
    }

    const leadId = insertLead({
      first_name: clean.firstName,
      last_name: clean.lastName,
      email: clean.email,
      phone: clean.phone || null,
      intent: clean.intent,
      budget: clean.budget || null,
      guide: clean.guide,
      source: 'guide_download',
      ip: req.ip,
    });

    scheduleNurtureSequence(leadId);

    // Also write the guide request to the CRM used by the admin dashboard.
    const crmLead = crmDb.createLead({
      name: `${clean.firstName} ${clean.lastName}`.trim(),
      email: clean.email,
      phone: clean.phone || '',
      source: 'guide_download',
      lead_type: clean.intent === 'selling' ? 'seller' : clean.intent === 'buying' ? 'buyer' : 'consultation',
      notes: `Guide: ${clean.guide}\nIntent: ${clean.intent}\nBudget: ${clean.budget || 'Not provided'}` ,
      budget: clean.budget || null
    });

    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' });

    // Send visitor delivery email + internal notification in parallel.
    // Failures here are logged but do NOT fail the request — the lead is already
    // saved, which is the most important thing to not lose.
    const [visitorResult, internalResult] = await Promise.allSettled([
      sendEmail({ ...guideDeliveryEmail({ firstName: clean.firstName, guideKey: clean.guide }), to: clean.email }),
      sendEmail(internalLeadNotification({ ...clean, timestamp })),
    ]);

    if (visitorResult.status === 'rejected') {
      console.error('[guide-request] Failed to send visitor guide email:', visitorResult.reason);
      return res.status(502).json({ ok: false, leadId: crmLead?.id || leadId, error: 'Your information was saved, but the guide email could not be sent. Please try again.' });
    }
    if (internalResult.status === 'rejected') {
      console.error('[guide-request] Failed to send internal notification:', internalResult.reason);
    }

    return res.json({ ok: true, leadId });
  } catch (err) {
    console.error('[guide-request] Unexpected error:', err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again or email us directly.' });
  }
});

module.exports = router;
