// lib/nurture-runner.js
// The actual "send whatever's due" logic, extracted so it can be triggered
// two ways: the CLI script (scripts/send-nurture.js, for a real crontab on
// an always-on server) or the HTTP endpoint (POST /api/internal/run-nurture,
// for platforms like Render where a simple scheduled HTTP call is easier to
// wire up than a second process sharing the same disk).

const { getDueNurtureItems, markNurtureSent, markNurtureFailed } = require('./db');
const { nurtureEmail, sendEmail } = require('./email');

async function runNurtureBatch(limit = 100) {
  const due = getDueNurtureItems(limit);
  let sent = 0;
  let failed = 0;
  const details = [];

  for (const item of due) {
    const email = nurtureEmail(item.step_key, { firstName: item.first_name });
    if (!email) {
      details.push({ id: item.id, step: item.step_key, result: 'unknown_step_skipped' });
      continue;
    }
    try {
      await sendEmail({ ...email, to: item.email });
      markNurtureSent(item.id);
      sent += 1;
      details.push({ id: item.id, step: item.step_key, to: item.email, result: 'sent' });
    } catch (err) {
      markNurtureFailed(item.id, err && err.message ? err.message : err);
      failed += 1;
      details.push({ id: item.id, step: item.step_key, to: item.email, result: 'failed', error: err.message });
    }
  }

  return { checked: due.length, sent, failed, details };
}

module.exports = { runNurtureBatch };
