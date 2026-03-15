const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { createLead, updateLeadByQuoteId } = require("../services/zohoCRM");

// ── POST /api/quotes — save a quote and return shareable link ──
router.post("/", (req, res) => {
  try {
    const q = req.body;

    if (!q.quote_id) {
      return res.status(400).json({ error: "quote_id is required" });
    }

    // Calculate expiry (30 days from now)
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiry_date = expiry.toISOString();

    // Store brand as JSON string
    const brandJson = typeof q.brand === "object" ? JSON.stringify(q.brand) : (q.brand || "{}");

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO quotes
        (quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at, expiry_date, vol, cnt, avgTx, cur, debitFrac, addons)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Bundle addon fees into a JSON blob
    const addons = JSON.stringify({
      addAmex:       !!q.addAmex,
      amexPct:       parseFloat(q.amexPct)   || 3.5,
      amexFixed:     parseFloat(q.amexFixed)  || 20,
      addFX:         !!q.addFX,
      fxPct:         parseFloat(q.fxPct)      || 1.5,
      addChargeback: !!q.addChargeback,
      cbAmt:         parseFloat(q.cbAmt)      || 15,
      addRefund:     !!q.addRefund,
      refAmt:        parseFloat(q.refAmt)     || 1
    });

    stmt.run(
      q.quote_id,
      q.merchant_name  || "",
      q.merchant_email || "",
      parseFloat(q.rate)      || 0,
      parseFloat(q.fixed_fee) || 0,
      brandJson,
      q.created_at || new Date().toISOString(),
      expiry_date,
      parseFloat(q.vol)       || 0,
      parseFloat(q.cnt)       || 0,
      parseFloat(q.avgTx)     || 0,
      parseFloat(q.cur)       || 0,
      parseFloat(q.debitFrac) || 0.70,
      addons
    );

    // Build shareable link pointing to quote.html (merchant page)
    const origin = process.env.PUBLIC_URL || (req.protocol + "://" + req.get("host"));
    const url = `${origin}/quote.html?quote=${q.quote_id}`;

    // ── Zoho CRM: create Lead (fire-and-forget, never blocks response) ──
    const vol = parseFloat(q.vol) || 0;
    const cnt = parseFloat(q.cnt) || 0;
    const curRate = (vol > 0 && parseFloat(q.cur) > 0)
      ? Math.round((parseFloat(q.cur) / vol) * 10000) / 100
      : null;

    createLead({
      merchant_name:     q.merchant_name  || "",
      merchant_email:    q.merchant_email || "",
      quote_id:          q.quote_id,
      quote_link:        url,
      monthly_volume:    vol,
      transaction_count: cnt,
      current_rate:      curRate,
      quoted_rate:       parseFloat(q.rate) || 0,
      quote_source:      "Admin Quote Builder",
    }).catch(err => console.error("⚠️  Zoho CRM lead error (admin):", err.message));

    res.json({
      success:     true,
      url:         url,
      quote_id:    q.quote_id,
      expiry_date: expiry_date
    });

  } catch (err) {
    console.error("Error saving quote:", err);
    res.status(500).json({ error: "Failed to save quote" });
  }
});

// ── POST /api/quotes/viewed — track when merchant views a quote ──
router.post("/viewed", async (req, res) => {
  try {
    const { quote_id } = req.body;

    if (!quote_id) {
      return res.status(400).json({ error: "quote_id is required" });
    }

    // Fire-and-forget: update Zoho Lead status
    updateLeadByQuoteId(quote_id, {
      Quote_Status: "Quote Viewed",
    }).catch(err => console.error("⚠️  Zoho CRM viewed-update error:", err.message));

    console.log(`👁️  Quote viewed: ${quote_id}`);
    res.json({ success: true });

  } catch (err) {
    console.error("Error recording quote view:", err);
    res.status(500).json({ error: "Failed to record quote view" });
  }
});

// ── GET /api/quotes/:quote_id — load a stored quote ───────────
router.get("/:quote_id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM quotes WHERE quote_id = ?").get(req.params.quote_id);

    if (!row) {
      return res.status(404).json({ error: "Quote not found" });
    }

    // Check expiry
    if (row.expiry_date && new Date(row.expiry_date) < new Date()) {
      return res.status(410).json({ error: "Quote has expired", expired_at: row.expiry_date });
    }

    // Parse brand JSON back to object
    let brand = {};
    try { brand = JSON.parse(row.brand || "{}"); } catch(e) { /* keep empty */ }

    // Parse addons JSON
    let addons = {};
    try { addons = JSON.parse(row.addons || "{}"); } catch(e) { /* keep empty */ }

    res.json({
      quote_id:       row.quote_id,
      merchant_name:  row.merchant_name,
      merchant_email: row.merchant_email,
      rate:           row.rate,
      fixed_fee:      row.fixed_fee,
      brand:          brand,
      created_at:     row.created_at,
      expiry_date:    row.expiry_date,
      vol:            row.vol       || 0,
      cnt:            row.cnt       || 0,
      avgTx:          row.avgTx     || 0,
      cur:            row.cur       || 0,
      debitFrac:      row.debitFrac || 0.70,
      addons:         addons
    });

  } catch (err) {
    console.error("Error loading quote:", err);
    res.status(500).json({ error: "Failed to load quote" });
  }
});

module.exports = router;
