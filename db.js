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

  CREATE TABLE IF NOT EXISTS leads (
    id          TEXT PRIMARY KEY,
    data        TEXT DEFAULT '{}',
    status      TEXT DEFAULT 'draft',
    risk_level  TEXT DEFAULT '',
    decision    TEXT DEFAULT '',
    created_at  TEXT,
    updated_at  TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT
  );
`);

// ── Migration: add columns if upgrading from older schema ─────
const cols = db.pragma("table_info(quotes)").map(c => c.name);
if (!cols.includes("vol"))       db.exec("ALTER TABLE quotes ADD COLUMN vol       REAL DEFAULT 0");
if (!cols.includes("cnt"))       db.exec("ALTER TABLE quotes ADD COLUMN cnt       REAL DEFAULT 0");
if (!cols.includes("avgTx"))     db.exec("ALTER TABLE quotes ADD COLUMN avgTx     REAL DEFAULT 0");
if (!cols.includes("cur"))       db.exec("ALTER TABLE quotes ADD COLUMN cur       REAL DEFAULT 0");
if (!cols.includes("debitFrac")) db.exec("ALTER TABLE quotes ADD COLUMN debitFrac REAL DEFAULT 0.70");
if (!cols.includes("intlFrac"))               db.exec("ALTER TABLE quotes ADD COLUMN intlFrac              REAL");
if (!cols.includes("addons"))                 db.exec("ALTER TABLE quotes ADD COLUMN addons                TEXT DEFAULT '{}'");
if (!cols.includes("sell_uk_rate"))           db.exec("ALTER TABLE quotes ADD COLUMN sell_uk_rate          REAL");
if (!cols.includes("sell_international_rate"))db.exec("ALTER TABLE quotes ADD COLUMN sell_international_rate REAL");
if (!cols.includes("blended_rate"))           db.exec("ALTER TABLE quotes ADD COLUMN blended_rate          REAL");
if (!cols.includes("current_uk_rate"))        db.exec("ALTER TABLE quotes ADD COLUMN current_uk_rate       REAL");
if (!cols.includes("current_intl_rate"))      db.exec("ALTER TABLE quotes ADD COLUMN current_intl_rate     REAL");
if (!cols.includes("pricing_mode"))           db.exec("ALTER TABLE quotes ADD COLUMN pricing_mode          TEXT");
if (!cols.includes("split_is_primary"))       db.exec("ALTER TABLE quotes ADD COLUMN split_is_primary      INTEGER DEFAULT 0");
if (!cols.includes("has_real_international_data")) db.exec("ALTER TABLE quotes ADD COLUMN has_real_international_data INTEGER DEFAULT 0");
if (!cols.includes("is_domestic_only_confirmed"))  db.exec("ALTER TABLE quotes ADD COLUMN is_domestic_only_confirmed  INTEGER DEFAULT 0");
if (!cols.includes("intl_mix_status"))              db.exec("ALTER TABLE quotes ADD COLUMN intl_mix_status              TEXT");
if (!cols.includes("intl_region"))                  db.exec("ALTER TABLE quotes ADD COLUMN intl_region                  TEXT");

// ── Migration: leads table columns (safe additive) ───────────
const leadCols = db.pragma("table_info(leads)").map(c => c.name);
if (!leadCols.includes("risk_level")) db.exec("ALTER TABLE leads ADD COLUMN risk_level TEXT DEFAULT ''");
if (!leadCols.includes("decision"))   db.exec("ALTER TABLE leads ADD COLUMN decision   TEXT DEFAULT ''");
if (!leadCols.includes("zoho_pushed")) db.exec("ALTER TABLE leads ADD COLUMN zoho_pushed INTEGER DEFAULT 0");
if (!leadCols.includes("notes"))       db.exec("ALTER TABLE leads ADD COLUMN notes       TEXT DEFAULT '[]'");
if (!leadCols.includes("assigned_to")) db.exec("ALTER TABLE leads ADD COLUMN assigned_to TEXT DEFAULT ''");
if (!leadCols.includes("activity"))         db.exec("ALTER TABLE leads ADD COLUMN activity         TEXT DEFAULT '[]'");
if (!leadCols.includes("brand"))            db.exec("ALTER TABLE leads ADD COLUMN brand            TEXT DEFAULT 'minted'");
if (!leadCols.includes("intl_region"))      db.exec("ALTER TABLE leads ADD COLUMN intl_region      TEXT DEFAULT NULL");
if (!leadCols.includes("industry"))         db.exec("ALTER TABLE leads ADD COLUMN industry         TEXT DEFAULT NULL");
if (!leadCols.includes("industry_status"))  db.exec("ALTER TABLE leads ADD COLUMN industry_status  TEXT DEFAULT 'allowed'");

module.exports = db;
