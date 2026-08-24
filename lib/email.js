// lib/email.js
// Resend client + every HTML email template used by the guide-download flow
// and the 5-touch nurture sequence (day0 delivery + day2/5/8/12 follow-ups).

const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.FROM_EMAIL || '';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'beasleymotion@gmail.com';
const SITE_URL = process.env.SITE_URL || 'https://withbeasley.com';
const GUIDES_DIR = process.env.GUIDES_DIR || path.join(__dirname, '..', 'public', 'guides');
const AGENT_NAME = 'Blaze Beasley';
const GOLD = '#A9834C';
const BLACK = '#15130F';
const IVORY = '#FAF7F1';
const CHARCOAL2 = '#403E38';

const GUIDE_META = {
  buyer:  { label: "Buyer's Guide",        file: 'sma-buyers-guide.pdf',    subject: "Your San Miguel Buyer's Guide is Here" },
  seller: { label: "Seller's Playbook",    file: 'sma-sellers-playbook.pdf', subject: "Your San Miguel Seller's Playbook is Here" },
  moving: { label: 'Moving to San Miguel', file: 'sma-moving-guide.pdf',    subject: 'Your San Miguel Relocation Guide is Here' },
};

/* ---------------- shared layout ---------------- */
function layout({ preheader = '', bodyHtml }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:Georgia,'Times New Roman',serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:${BLACK};padding:28px 36px;">
          <div style="font-family:Georgia,serif;font-size:20px;color:#ffffff;letter-spacing:0.3px;">Blaze Beasley</div>
          <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-top:4px;">San Miguel de Allende Real Estate</div>
        </td></tr>
        <tr><td style="padding:40px 36px;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="background:${IVORY};padding:22px 36px;font-family:Arial,sans-serif;font-size:11px;color:#8a8378;">
          Blaze Beasley Real Estate &middot; San Miguel de Allende, Guanajuato, Mexico<br>
          You're receiving this because you requested a guide at ${SITE_URL.replace(/^https?:\/\//,'')}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(label, href) {
  return `<a href="${href}" style="display:inline-block;background:${GOLD};color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;letter-spacing:0.3px;padding:14px 28px;border-radius:3px;margin:18px 0;">${label}</a>`;
}

/* ---------------- 1. Guide delivery email (Day 0) ---------------- */
function guideDeliveryEmail({ firstName, guideKey }) {
  const meta = GUIDE_META[guideKey] || GUIDE_META.buyer;
  const downloadUrl = `${SITE_URL}/guides/${meta.file}`;
  const bodyHtml = `
    <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;margin:0 0 16px;">Hi ${firstName},</p>
    <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;margin:0 0 16px;">
      Thanks for requesting the San Miguel ${meta.label}. You can download it below.
    </p>
    <div>${button('Download Your Guide', downloadUrl)}</div>
    <p style="font-size:14px;color:${CHARCOAL2};line-height:1.7;margin:22px 0;">
      The guide is a concise starting point for a more thoughtful conversation about your San Miguel plans. It is not legal, tax, financing, immigration, residency, banking, healthcare, or notarial advice; for those questions, consult qualified local professionals.
    </p>
    <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;margin:0 0 16px;">
      If you have questions, simply reply to this email.
    </p>
    <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;margin:0;">
      Looking forward to helping you find the right home.<br>— Blaze
    </p>`;

  // Attach the PDF's actual bytes (base64) rather than a remote `path` URL.
  // This is deliberately more robust than a URL-based attachment: it doesn't
  // depend on the site being publicly reachable at the moment Resend processes
  // the send, and it avoids relying on URL-fetch attachment support that may
  // differ across Resend SDK versions (something I can't verify against live
  // docs in this environment — see README "Known unknowns").
  let attachments = [];
  try {
    const filePath = path.join(GUIDES_DIR, meta.file);
    const fileBuffer = fs.readFileSync(filePath);
    attachments = [{ filename: meta.file, content: fileBuffer.toString('base64') }];
  } catch (err) {
    console.error(`[email] Could not read guide PDF at ${meta.file} — sending without attachment, relying on the download link instead.`, err.message);
  }

  return {
    to: null, // set by caller
    from: FROM_EMAIL,
    subject: meta.subject,
    html: layout({ preheader: `Your ${meta.label} is ready to download.`, bodyHtml }),
    attachments,
  };
}

/* ---------------- 2. Internal new-lead notification ---------------- */
function internalLeadNotification({ firstName, lastName, email, phone, intent, budget, guideKey, timestamp }) {
  const meta = GUIDE_META[guideKey] || GUIDE_META.buyer;
  const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;font-family:Arial,sans-serif;font-size:13px;color:#8a8378;">${k}</td><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:${BLACK};font-weight:bold;">${v || '—'}</td></tr>`;
  const bodyHtml = `
    <p style="font-family:Arial,sans-serif;font-size:15px;color:${BLACK};font-weight:bold;margin:0 0 18px;">New ${meta.label} Download</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${row('Name', `${firstName} ${lastName}`)}
      ${row('Email', email)}
      ${row('Phone', phone)}
      ${row('Buying/Selling', intent)}
      ${row('Budget', budget)}
      ${row('Timestamp', timestamp)}
    </table>
    <div>${button('View in Dashboard', `${SITE_URL}/admin/leads`)}</div>`;
  return {
    to: NOTIFY_EMAIL,
    from: FROM_EMAIL,
    subject: 'New Website Lead',
    html: layout({ preheader: `New ${meta.label} download from ${firstName} ${lastName}`, bodyHtml }),
  };
}

/* ---------------- 3. Nurture sequence (day2 / day5 / day8 / day12) ---------------- */
const NURTURE_CONTENT = {
  day2: {
    subject: 'The 5 Best Neighborhoods in San Miguel',
    bodyHtml: (firstName) => `
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">Hi ${firstName},</p>
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">San Miguel isn't one neighborhood — it's several distinct ways of living. Here's a quick tour of the ones clients ask about most:</p>
      <ul style="font-size:14px;color:${CHARCOAL2};line-height:2;padding-left:20px;">
        <li><b>Centro</b> — walkable, historic, steps from La Parroquia</li>
        <li><b>San Antonio</b> — artistic, youthful, home to Fábrica La Aurora</li>
        <li><b>Guadiana</b> — quiet, residential, close to schools</li>
        <li><b>Atascadero</b> — elevated, panoramic views, larger lots</li>
        <li><b>Balcones</b> — upscale, gated, San Miguel's premier community</li>
      </ul>
      <div>${button('See Neighborhood Guides', `${SITE_URL}/#neighborhoods`)}</div>
      <p style="font-size:14px;color:${CHARCOAL2};line-height:1.7;">Curious which one fits your lifestyle? Reply and tell me what matters most to you day-to-day.</p>
      <p style="font-size:15px;color:${CHARCOAL2};">— Blaze</p>`,
  },
  day5: {
    subject: 'What $500,000 USD Buys You in San Miguel',
    bodyHtml: (firstName) => `
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">Hi ${firstName},</p>
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">A number I get asked constantly: what does $500,000 USD actually get you here? As a general, illustrative sense of the market:</p>
      <ul style="font-size:14px;color:${CHARCOAL2};line-height:2;padding-left:20px;">
        <li>A well-located 3-bedroom home in Guadiana or Los Frailes</li>
        <li>A smaller, character-rich property in San Antonio</li>
        <li>A strong down payment toward a larger home in Atascadero or Balcones</li>
      </ul>
      <p style="font-size:14px;color:${CHARCOAL2};line-height:1.7;">Every budget lands differently depending on neighborhood and priorities — happy to run a real comparison for your specific number.</p>
      <div>${button('See Current Listings', `${SITE_URL}/#listings`)}</div>
      <p style="font-size:15px;color:${CHARCOAL2};">— Blaze</p>`,
  },
  day8: {
    subject: 'How One Buyer Found Their San Miguel Home',
    bodyHtml: (firstName) => `
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">Hi ${firstName},</p>
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">
        [PLACEHOLDER — replace with a real, specific client story before this email goes live: their starting
        criteria, what changed their mind, and the moment the right home clicked. A genuine story, with the
        client's permission, will resonate far more than anything generic.]
      </p>
      <p style="font-size:14px;color:${CHARCOAL2};line-height:1.7;">
        In the meantime — if you'd like to talk through what you're looking for, I'm just a reply away.
      </p>
      <div>${button('Book a Consultation', `${SITE_URL}/#contact`)}</div>
      <p style="font-size:15px;color:${CHARCOAL2};">— Blaze</p>`,
  },
  day12: {
    subject: "Let's Talk About Your San Miguel Search",
    bodyHtml: (firstName) => `
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">Hi ${firstName},</p>
      <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">
        You downloaded the guide about two weeks ago — no pressure at all, just checking in. A short call is
        often the fastest way to turn a general idea into a shortlist of real properties worth seeing.
      </p>
      <div>${button('Book a Free Consultation', `${SITE_URL}/#contact`)}</div>
      <p style="font-size:14px;color:${CHARCOAL2};line-height:1.7;">
        If now isn't the right time, that's completely fine — I'm here whenever you're ready.
      </p>
      <p style="font-size:15px;color:${CHARCOAL2};">— Blaze</p>`,
  },
};

function nurtureEmail(stepKey, { firstName }) {
  const c = NURTURE_CONTENT[stepKey];
  if (!c) return null;
  return {
    from: FROM_EMAIL,
    subject: c.subject,
    html: layout({ preheader: c.subject, bodyHtml: c.bodyHtml(firstName) }),
  };
}

/* ---------------- send helpers ---------------- */
async function sendEmail(payload) {
  if (!process.env.RESEND_API_KEY) throw new Error('Email delivery is not configured: RESEND_API_KEY is missing.');
  if (!FROM_EMAIL) throw new Error('Email delivery is not configured: FROM_EMAIL is missing.');
  if (!payload.to) throw new Error('Email delivery is not configured: recipient is missing.');
  return resend.emails.send(payload);
}

module.exports = {
  GUIDE_META,
  guideDeliveryEmail,
  internalLeadNotification,
  nurtureEmail,
  sendEmail,
};
