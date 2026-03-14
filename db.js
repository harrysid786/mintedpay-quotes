const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "quotes.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS quotes (
    quote_id      TEXT PRIMARY KEY,
    merchant_name  TEXT,
    merchant_email TEXT,
    rate           REAL,
    fixed_fee      REAL,
    brand          TEXT,
    created_at     TEXT,
    expiry_date    TEXT
  );

  CREATE TABLE IF NOT EXISTS quote_acceptance (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id       TEXT,
    merchant_name  TEXT,
    merchant_email TEXT,
    accepted_at    TEXT,
    ip_address     TEXT
  );
`);

module.exports = db;
