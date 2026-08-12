// lib/crm-db.js
// Storage for property-inquiry leads (distinct from the guide-download
// leads in lib/db.js) — this is the sales-pipeline CRM: stage tracking,
// notes, tags, per-property attribution.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.CRM_DB_PATH || path.join(__dirname, '..', 'data', 'crm.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const STAGES = ['new', 'contacted', 'showing_scheduled', 'negotiating', 'under_contract', 'closed', 'lost'];

db.exec(`
  CREATE TABLE IF NOT EXISTS crm_leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    property_id INTEGER,
    property_title TEXT,
    source TEXT DEFAULT 'website',
    stage TEXT NOT NULL DEFAULT 'new',
    notes TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(stage, archived);
`);

function rowToLead(row) {
  if (!row) return null;
  return { ...row, tags: safeParse(row.tags_json, []), archived: !!row.archived };
}
function safeParse(s, fb) { try { return JSON.parse(s || 'null') ?? fb; } catch { return fb; } }

function createLead({ name, email, phone, property_id, property_title, source }) {
  const info = db.prepare(`
    INSERT INTO crm_leads (name, email, phone, property_id, property_title, source)
    VALUES (@name, @email, @phone, @property_id, @property_title, @source)
  `).run({
    name, email, phone: phone || null,
    property_id: property_id || null,
    property_title: property_title || null,
    source: source || 'website',
  });
  return getLead(info.lastInsertRowid);
}

function getLead(id) {
  return rowToLead(db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id));
}

function listLeads({ stage, search, includeArchived = false } = {}) {
  const where = [];
  const params = {};
  if (!includeArchived) where.push('archived = 0');
  if (stage) { where.push('stage = @stage'); params.stage = stage; }
  if (search) {
    where.push('(name LIKE @search OR email LIKE @search OR property_title LIKE @search)');
    params.search = `%${search}%`;
  }
  const sql = `SELECT * FROM crm_leads ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`;
  return db.prepare(sql).all(params).map(rowToLead);
}

function updateLead(id, patch) {
  const existing = db.prepare('SELECT * FROM crm_leads WHERE id = ?').get(id);
  if (!existing) return null;
  const merged = {
    stage: patch.stage ?? existing.stage,
    notes: patch.notes ?? existing.notes,
    tags_json: patch.tags ? JSON.stringify(patch.tags) : existing.tags_json,
    archived: patch.archived != null ? (patch.archived ? 1 : 0) : existing.archived,
  };
  db.prepare(`
    UPDATE crm_leads SET stage=@stage, notes=@notes, tags_json=@tags_json, archived=@archived, updated_at=datetime('now')
    WHERE id=${id}
  `).run(merged);
  return getLead(id);
}

function recentLeads(limit = 5) {
  return db.prepare('SELECT * FROM crm_leads WHERE archived = 0 ORDER BY created_at DESC LIMIT ?').all(limit).map(rowToLead);
}

module.exports = { STAGES, createLead, getLead, listLeads, updateLead, recentLeads };
