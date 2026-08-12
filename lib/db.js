// lib/db.js
// SQLite storage for leads and the scheduled nurture-email queue.
// Swap this file for a Supabase/Postgres client later without touching callers,
// as long as the exported function signatures stay the same.

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'leads.db');

const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    intent TEXT NOT NULL,           -- 'buying' | 'selling' | 'both'
    budget TEXT,
    guide TEXT NOT NULL,            -- 'buyer' | 'seller' | 'moving'
    source TEXT DEFAULT 'guide_download',
    ip TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS nurture_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    step_key TEXT NOT NULL,         -- 'day0' | 'day2' | 'day5' | 'day8' | 'day12'
    send_at TEXT NOT NULL,          -- ISO timestamp when this step becomes due
    sent_at TEXT,                   -- set once actually sent
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed' | 'skipped'
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_nurture_due ON nurture_queue (status, send_at);
  CREATE INDEX IF NOT EXISTS idx_leads_email ON leads (email);
`);

function insertLead(lead) {
  const stmt = db.prepare(`
    INSERT INTO leads (first_name, last_name, email, phone, intent, budget, guide, source, ip)
    VALUES (@first_name, @last_name, @email, @phone, @intent, @budget, @guide, @source, @ip)
  `);
  const info = stmt.run(lead);
  return info.lastInsertRowid;
}

// Nurture schedule: day0 is sent synchronously at request time (the guide delivery
// email itself), so we only queue the four follow-up touches here.
const NURTURE_SCHEDULE = [
  { step_key: 'day2', offsetDays: 2 },
  { step_key: 'day5', offsetDays: 5 },
  { step_key: 'day8', offsetDays: 8 },
  { step_key: 'day12', offsetDays: 12 },
];

function scheduleNurtureSequence(leadId, startDate = new Date()) {
  const stmt = db.prepare(`
    INSERT INTO nurture_queue (lead_id, step_key, send_at)
    VALUES (@lead_id, @step_key, @send_at)
  `);
  const insertMany = db.transaction((rows) => {
    for (const row of rows) stmt.run(row);
  });
  const rows = NURTURE_SCHEDULE.map(({ step_key, offsetDays }) => {
    const sendAt = new Date(startDate.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    return { lead_id: leadId, step_key, send_at: sendAt.toISOString() };
  });
  insertMany(rows);
}

function getDueNurtureItems(limit = 50) {
  return db.prepare(`
    SELECT nq.*, l.first_name, l.last_name, l.email, l.intent, l.guide
    FROM nurture_queue nq
    JOIN leads l ON l.id = nq.lead_id
    WHERE nq.status = 'pending' AND nq.send_at <= datetime('now')
    ORDER BY nq.send_at ASC
    LIMIT ?
  `).all(limit);
}

function markNurtureSent(id) {
  db.prepare(`UPDATE nurture_queue SET status='sent', sent_at=datetime('now') WHERE id=?`).run(id);
}

function markNurtureFailed(id, errorMessage) {
  db.prepare(`
    UPDATE nurture_queue
    SET status='pending', attempts = attempts + 1, last_error = ?
    WHERE id = ?
  `).run(String(errorMessage).slice(0, 500), id);
}

function findRecentLeadByEmail(email, withinMinutes = 2) {
  return db.prepare(`
    SELECT * FROM leads
    WHERE email = ? AND created_at >= datetime('now', ?)
    ORDER BY created_at DESC LIMIT 1
  `).get(email, `-${withinMinutes} minutes`);
}

module.exports = {
  db,
  insertLead,
  scheduleNurtureSequence,
  getDueNurtureItems,
  markNurtureSent,
  markNurtureFailed,
  findRecentLeadByEmail,
};
