const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "quotes.db"));

// Create tables on startup
db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    quote_id       TEXT PRIMARY KEY,
    merchant_name  TEXT,
    merchant_email TEXT,
    rate           REAL,
    fixed_fee      REAL,
    brand          TEXT,
    created_at     TEXT,
    expiry_date    TEXT,
    vol            REAL DEFAULT 0,
    cnt            REAL DEFAULT 0,
    avgTx          REAL DEFAULT 0,
    cur            REAL DEFAULT 0,
    debitFrac      REAL DEFAULT 0.70
  );

  CREATE TABLE IF NOT EXISTS quote_acceptance (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id       TEXT UNIQUE,
    merchant_name  TEXT,
    merchant_email TEXT,
    accepted_at    TEXT,
    ip_address     TEXT
  );
`);

// ── Migration: add columns if upgrading from older schema ─────
const cols = db.pragma("table_info(quotes)").map(c => c.name);
if (!cols.includes("vol"))       db.exec("ALTER TABLE quotes ADD COLUMN vol       REAL DEFAULT 0");
if (!cols.includes("cnt"))       db.exec("ALTER TABLE quotes ADD COLUMN cnt       REAL DEFAULT 0");
if (!cols.includes("avgTx"))     db.exec("ALTER TABLE quotes ADD COLUMN avgTx     REAL DEFAULT 0");
if (!cols.includes("cur"))       db.exec("ALTER TABLE quotes ADD COLUMN cur       REAL DEFAULT 0");
if (!cols.includes("debitFrac")) db.exec("ALTER TABLE quotes ADD COLUMN debitFrac REAL DEFAULT 0.70");
if (!cols.includes("addons"))    db.exec("ALTER TABLE quotes ADD COLUMN addons    TEXT DEFAULT '{}'");

module.exports = db;
