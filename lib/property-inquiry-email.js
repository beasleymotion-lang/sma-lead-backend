// lib/property-inquiry-email.js
// Two more email templates for the property-inquiry form (distinct from the
// guide-download flow in lib/email.js, but sharing the same visual layout).

const { fmtPrice } = require('./seo');

const FROM_EMAIL = process.env.FROM_EMAIL || 'Blaze Beasley <blaze@sanmiguelrealty.example>';
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || 'blaze@sanmiguelrealty.example';
const SITE_URL = process.env.SITE_URL || 'https://example.com';
const GOLD = '#A9834C';
const BLACK = '#15130F';
const IVORY = '#FAF7F1';
const CHARCOAL2 = '#403E38';

function layout({ preheader = '', bodyHtml }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${IVORY};font-family:Georgia,'Times New Roman',serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:560px;width:100%;">
        <tr><td style="background:${BLACK};padding:28px 36px;">
          <div style="font-family:Georgia,serif;font-size:20px;color:#ffffff;">Blaze Beasley</div>
          <div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:${GOLD};margin-top:4px;">San Miguel de Allende Real Estate</div>
        </td></tr>
        <tr><td style="padding:40px 36px;">${bodyHtml}</td></tr>
        <tr><td style="background:${IVORY};padding:22px 36px;font-family:Arial,sans-serif;font-size:11px;color:#8a8378;">
          Blaze Beasley Real Estate &middot; San Miguel de Allende, Guanajuato, Mexico
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
function button(label, href) {
  return `<a href="${href}" style="display:inline-block;background:${GOLD};color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:13px;padding:14px 28px;border-radius:3px;margin:18px 0;">${label}</a>`;
}

function propertyInquiryVisitorEmail({ name, property, message }) {
  const firstName = (name || '').split(' ')[0] || 'there';
  const propLine = property
    ? `<p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">You asked about <b>${property.title}</b> in ${property.neighborhood || 'San Miguel de Allende'} — ${fmtPrice(property.price, property.currency)}.</p>`
    : '';
  const bodyHtml = `
    <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">Hi ${firstName},</p>
    <p style="font-size:15px;color:${CHARCOAL2};line-height:1.7;">Thanks for reaching out — I've received your inquiry and will follow up personally, usually within a few hours.</p>
    ${propLine}
    ${message ? `<div style="background:${IVORY};border-left:3px solid ${GOLD};padding:14px 18px;margin:18px 0;font-size:13.5px;color:${CHARCOAL2};">"${message}"</div>` : ''}
    <div>${button('View This Property', property ? `${SITE_URL}/properties/${property.slug}` : `${SITE_URL}/#listings`)}</div>
    <p style="font-size:14px;color:${CHARCOAL2};line-height:1.7;">Feel free to reply directly to this email with any other questions.</p>
    <p style="font-size:15px;color:${CHARCOAL2};">— Blaze</p>`;
  return {
    from: FROM_EMAIL,
    subject: property ? `Re: ${property.title}` : 'Thanks for your inquiry',
    html: layout({ preheader: 'Thanks for reaching out — I will follow up shortly.', bodyHtml }),
  };
}

function propertyInquiryInternalEmail({ name, email, phone, property, message, timestamp }) {
  const row = (k, v) => `<tr><td style="padding:6px 12px 6px 0;font-family:Arial,sans-serif;font-size:13px;color:#8a8378;">${k}</td><td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:${BLACK};font-weight:bold;">${v || '—'}</td></tr>`;
  const bodyHtml = `
    <p style="font-family:Arial,sans-serif;font-size:15px;color:${BLACK};font-weight:bold;margin:0 0 18px;">New Property Inquiry</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${row('Name', name)}
      ${row('Email', email)}
      ${row('Phone', phone)}
      ${row('Property', property ? property.title : 'Not specified')}
      ${row('Neighborhood', property ? property.neighborhood : '—')}
      ${row('Price', property ? fmtPrice(property.price, property.currency) : '—')}
      ${row('Message', message)}
      ${row('Timestamp', timestamp)}
    </table>
    <div>${button('Open Admin Dashboard', `${SITE_URL}/admin`)}</div>`;
  return {
    to: NOTIFY_EMAIL,
    from: FROM_EMAIL,
    subject: `New Inquiry: ${property ? property.title : 'General'}`,
    html: layout({ preheader: `New inquiry from ${name}`, bodyHtml }),
  };
}

module.exports = { propertyInquiryVisitorEmail, propertyInquiryInternalEmail };
