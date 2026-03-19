const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { createLead, getLeadByQuoteId, updateLeadByQuoteId } = require("../services/zohoCRM");

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

    // Enforce minimum fixed fee of 10p before saving
    const safeFee = Math.max(parseFloat(q.fixed_fee) || 0, 10);

    stmt.run(
      q.quote_id,
      q.merchant_name  || "",
      q.merchant_email || "",
      parseFloat(q.rate)      || 0,
      safeFee,
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

    // Zoho push moved to dedicated /api/leads/:id/push-zoho endpoint

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

    // ── Only update to "Quote Viewed" if status is exactly "Quote Generated" ──
    // Any other status means the pipeline has already moved forward — skip
    (async () => {
      const lead = await getLeadByQuoteId(quote_id);
      if (!lead) return;

      const currentStatus = lead.Quote_Status || "";
      if (currentStatus !== "Quote Generated") {
        console.log(`⏭️  Quote ${quote_id} already at "${currentStatus}" — skipping "Quote Viewed" update`);
        return;
      }

      await updateLeadByQuoteId(quote_id, { Quote_Status: "Quote Viewed" });
    })().catch(err => console.error("⚠️  Zoho CRM viewed-update error:", err.message));

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

    // ── Re-derive regional pricing fields from stored inputs ────────────────
    // Regional rates are not stored as columns — they are deterministic from
    // debitFrac and intlFrac, so we recalculate rather than duplicate storage.
    // This means quote.html and PDF always get the full pricing object on load.
    const storedDebitFrac = row.debitFrac || 0.70;
    const storedIntlFrac  = (row.intlFrac !== null && row.intlFrac !== undefined)
      ? row.intlFrac : null;
    const storedVol = row.vol || 0;
    const storedCur = row.cur || 0;

    // Wespell cost is a constant — safe to reuse here
    const WESPELL_COST = 0.0435;

    // Re-derive regional rates using Standard profile (matches quote creation default)
    const REGIONAL_BASE = { uk: 1.10, international: 2.50 };
    const STANDARD_PROFILE = { targetMargin: 0.30, minDomestic: 1.60, minInternational: 2.80, forceSplitThreshold: 0.35 };

    const trueUkCost            = Math.round((REGIONAL_BASE.uk            + WESPELL_COST) * 10000) / 10000;
    const trueInternationalCost = Math.round((REGIONAL_BASE.international + WESPELL_COST) * 10000) / 10000;
    const sellUkRate            = Math.ceil(Math.max(trueUkCost            + STANDARD_PROFILE.targetMargin, STANDARD_PROFILE.minDomestic)    * 100) / 100;
    const sellInternationalRate = Math.ceil(Math.max(trueInternationalCost + STANDARD_PROFILE.targetMargin, STANDARD_PROFILE.minInternational) * 100) / 100;

    // Re-derive blended rate — only when real mix data was stored
    const csvDebitFracIsReal = storedIntlFrac !== null || storedDebitFrac !== 0.70;
    let blendedRate = null;
    if (storedIntlFrac !== null) {
      blendedRate = Math.round(((1 - storedIntlFrac) * sellUkRate + storedIntlFrac * sellInternationalRate) * 100) / 100;
    } else if (csvDebitFracIsReal) {
      blendedRate = Math.round((storedDebitFrac * sellUkRate + (1 - storedDebitFrac) * sellInternationalRate) * 100) / 100;
    }

    // Re-derive pricing mode
    let pricingMode    = "split_indicative";
    let splitIsPrimary = false;
    if (storedIntlFrac !== null) {
      if (storedIntlFrac >= STANDARD_PROFILE.forceSplitThreshold) {
        pricingMode    = "split_primary";
        splitIsPrimary = true;
      } else {
        pricingMode = blendedRate !== null ? "blended_primary" : "split_indicative";
      }
    }

    res.json({
      // ── Existing fields (unchanged) ──────────────────────────────────────
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
      debitFrac:      storedDebitFrac,
      addons:         addons,
      // ── New regional pricing fields ───────────────────────────────────────
      intlFrac:                storedIntlFrac,
      true_uk_cost:            trueUkCost,
      true_international_cost: trueInternationalCost,
      sell_uk_rate:            sellUkRate,
      sell_international_rate: sellInternationalRate,
      blended_rate:            blendedRate,
      pricing_mode:            pricingMode,
      split_is_primary:        splitIsPrimary,
      blended_is_valid:        blendedRate !== null,
    });

  } catch (err) {
    console.error("Error loading quote:", err);
    res.status(500).json({ error: "Failed to load quote" });
  }
});

module.exports = router;
