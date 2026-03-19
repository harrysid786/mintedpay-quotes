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

    // ── Read existing row first — used by all merge logic below ──────────────
    const existing = db.prepare("SELECT * FROM quotes WHERE quote_id = ?").get(q.quote_id);

    // Expiry: keep existing for known quotes; 30-day default for new rows only.
    // q.expiry_date is NOT accepted — callers cannot override expiry externally.
    const expiry_date = (() => {
      if (existing?.expiry_date) return existing.expiry_date;
      const e = new Date();
      e.setDate(e.getDate() + 30);
      return e.toISOString();
    })();

    // Store brand as JSON string — preserve existing if incoming is absent or invalid JSON.
    const brandJson = (() => {
      if (q.brand && typeof q.brand === "object" && Object.keys(q.brand).length > 0)
        return JSON.stringify(q.brand);
      if (q.brand && typeof q.brand === "string") {
        try {
          const parsed = JSON.parse(q.brand);
          if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0)
            return q.brand;
        } catch (_) { /* not valid JSON — fall through */ }
      }
      if (existing?.brand && existing.brand !== "{}")
        return existing.brand;
      return "{}";
    })();

    // Enforce minimum fixed fee of 10p before saving
    const incomingFixedFee = parseFloat(q.fixed_fee);
    const existingFixedFee = parseFloat(existing?.fixed_fee);
    const safeFee = Number.isFinite(incomingFixedFee)
      ? Math.max(incomingFixedFee, 10)
      : (Number.isFinite(existingFixedFee) ? Math.max(existingFixedFee, 10) : 10);

    // Helper: use incoming value when it is a real non-null number/string;
    // otherwise fall back to the existing DB value; otherwise null/default.
    const keepNum = (incoming, dbVal, dflt = null) => {
      const v = parseFloat(incoming);
      if (Number.isFinite(v)) return v;
      const d = parseFloat(dbVal);
      if (Number.isFinite(d)) return d;
      return dflt;
    };
    const keepStr = (incoming, dbVal, dflt = null) => {
      if (incoming !== undefined && incoming !== null && incoming !== "") return String(incoming);
      if (dbVal   !== undefined && dbVal   !== null && dbVal   !== "") return String(dbVal);
      return dflt;
    };
    const keepBool = (incoming, dbVal, dflt = 0) => {
      const norm = (v) => {
        if (v === undefined || v === null) return null;
        if (typeof v === "boolean") return v ? 1 : 0;
        if (typeof v === "number") return v ? 1 : 0;
        if (typeof v === "string") {
          const s = v.trim().toLowerCase();
          if (s === "true" || s === "1") return 1;
          if (s === "false" || s === "0" || s === "") return 0;
        }
        return v ? 1 : 0;
      };
      const incomingNorm = norm(incoming);
      if (incomingNorm !== null) return incomingNorm;
      const dbNorm = norm(dbVal);
      if (dbNorm !== null) return dbNorm;
      return dflt;
    };
    const keepJson = (incoming, dbVal, dflt = "{}") => {
      // Use incoming when it contains meaningful addon fields; otherwise keep existing
      if (incoming !== undefined && incoming !== null && incoming !== "") return incoming;
      if (dbVal    !== undefined && dbVal    !== null && dbVal    !== "") return dbVal;
      return dflt;
    };

    // Bundle addon fees — only rebuild from q fields if explicit addon keys present;
    // otherwise preserve whatever is already stored.
    const hasAddonFields = q.addAmex !== undefined || q.addFX !== undefined ||
                           q.addChargeback !== undefined || q.addRefund !== undefined;
    const addons = hasAddonFields
      ? JSON.stringify({
          addAmex:       !!q.addAmex,
          amexPct:       parseFloat(q.amexPct)   || 3.5,
          amexFixed:     parseFloat(q.amexFixed)  || 20,
          addFX:         !!q.addFX,
          fxPct:         parseFloat(q.fxPct)      || 1.5,
          addChargeback: !!q.addChargeback,
          cbAmt:         parseFloat(q.cbAmt)      || 15,
          addRefund:     !!q.addRefund,
          refAmt:        parseFloat(q.refAmt)     || 1
        })
      : keepJson(null, existing?.addons);

    // Merge: prefer valid incoming values, fall back to existing DB values
    const vol        = keepNum(q.vol,                    existing?.vol,                    0);
    const cnt        = keepNum(q.cnt,                    existing?.cnt,                    0);
    const avgTx      = keepNum(q.avgTx,                  existing?.avgTx,                  0);
    const cur        = keepNum(q.cur,                    existing?.cur,                    0);
    const debitFrac  = keepNum(q.debitFrac,              existing?.debitFrac,              0.70);
    const intlFrac   = keepNum(q.intlFrac,               existing?.intlFrac,               null);
    const sellUk     = keepNum(q.sell_uk_rate,           existing?.sell_uk_rate,           null);
    const sellIntl   = keepNum(q.sell_international_rate,existing?.sell_international_rate,null);
    const blended    = keepNum(q.blended_rate,           existing?.blended_rate,           null);
    const curUkRate  = keepNum(q.current_uk_rate,        existing?.current_uk_rate,        null);
    const curIntRate = keepNum(q.current_intl_rate,      existing?.current_intl_rate,      null);
    const pricingMode    = keepStr(q.pricing_mode,       existing?.pricing_mode,           null);
    const splitIsPrimary = keepBool(q.split_is_primary,  existing?.split_is_primary,       0);

    db.prepare(`
      INSERT OR REPLACE INTO quotes
        (quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at, expiry_date,
         vol, cnt, avgTx, cur, debitFrac, addons,
         intlFrac, sell_uk_rate, sell_international_rate, blended_rate,
         current_uk_rate, current_intl_rate, pricing_mode, split_is_primary)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      q.quote_id,
      q.merchant_name  || existing?.merchant_name  || "",
      q.merchant_email || existing?.merchant_email || "",
      Number.isFinite(parseFloat(q.rate)) ? parseFloat(q.rate) : (existing?.rate ?? 0),
      safeFee,
      brandJson,
      q.created_at || existing?.created_at || new Date().toISOString(),
      expiry_date,
      vol, cnt, avgTx, cur, debitFrac, addons,
      intlFrac, sellUk, sellIntl, blended,
      curUkRate, curIntRate, pricingMode, splitIsPrimary
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

    // ── Regional pricing fields ─────────────────────────────────────────────
    // Prefer the values stored at quote creation time (accurate to the profile used).
    // Fall back to re-derivation for older quotes that predate column storage.
    const storedDebitFrac = row.debitFrac ?? 0.70;
    const storedIntlFrac  = (row.intlFrac !== null && row.intlFrac !== undefined)
      ? row.intlFrac : null;

    let sellUkRate            = row.sell_uk_rate            ?? null;
    let sellInternationalRate = row.sell_international_rate ?? null;
    let blendedRate           = row.blended_rate            ?? null;
    let pricingMode           = row.pricing_mode            ?? null;
    let splitIsPrimary        = row.split_is_primary        ? true : false;
    const current_uk_rate     = row.current_uk_rate         ?? null;
    const current_intl_rate   = row.current_intl_rate       ?? null;

    // ── Fallback re-derivation for old quotes without stored regional fields ──
    // Constants match the current pricing engine Standard profile exactly.
    // Only runs when sell_uk_rate / sell_international_rate were never stored.
    if (sellUkRate === null || sellInternationalRate === null) {
      // IC++ components: interchange + scheme (0.13%) + acquirer markup (0.20% small tier) + wespell
      const WESPELL_COST    = 0.0435;
      const ACQUIRER_MARKUP = 0.20;   // conservative (≤£50k tier)
      const SCHEME_FEE      = 0.13;
      const UK_INTERCHANGE  = (0.70 * 0.20) + (0.30 * 0.30); // 0.23% blended
      const INTL_INTERCHANGE = 1.50;
      const STD_PROFILE     = { targetMargin: 0.30, minDomestic: 1.60, minInternational: 3.00 };
      const trueUkCost      = UK_INTERCHANGE   + SCHEME_FEE + ACQUIRER_MARKUP + WESPELL_COST;
      const trueIntlCost    = INTL_INTERCHANGE + SCHEME_FEE + ACQUIRER_MARKUP + WESPELL_COST;
      sellUkRate            = Math.ceil(Math.max(trueUkCost   + STD_PROFILE.targetMargin, STD_PROFILE.minDomestic)        * 100) / 100;
      sellInternationalRate = Math.ceil(Math.max(trueIntlCost + STD_PROFILE.targetMargin, STD_PROFILE.minInternational)   * 100) / 100;
    }

    if (blendedRate === null) {
      // csvDebitFracIsReal: only trust debitFrac as a mix signal when it is a positive
      // value that genuinely differs from the hardcoded default. debitFrac === 0 is not
      // a reliable signal — it likely means no debit cards were detected, not that
      // 100% of volume is international.
      const csvDebitFracIsReal = storedIntlFrac !== null ||
        (storedDebitFrac > 0 && storedDebitFrac < 1 && storedDebitFrac !== 0.70);
      if (storedIntlFrac !== null && storedIntlFrac > 0 && storedIntlFrac < 1) {
        blendedRate = Math.round(((1 - storedIntlFrac) * sellUkRate + storedIntlFrac * sellInternationalRate) * 100) / 100;
      } else if (csvDebitFracIsReal && storedIntlFrac === null) {
        blendedRate = Math.round((storedDebitFrac * sellUkRate + (1 - storedDebitFrac) * sellInternationalRate) * 100) / 100;
      }
    }

    if (pricingMode === null) {
      const STD_SPLIT_THRESHOLD = 0.35;
      if (storedIntlFrac !== null) {
        if (storedIntlFrac >= STD_SPLIT_THRESHOLD) {
          pricingMode    = "split_primary";
          splitIsPrimary = true;
        } else {
          pricingMode    = blendedRate !== null ? "blended_primary" : "split_indicative";
          splitIsPrimary = false;
        }
      } else {
        pricingMode    = "split_indicative";
        splitIsPrimary = false;
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
      // ── Regional pricing fields (stored or re-derived for old quotes) ──────
      intlFrac:                storedIntlFrac,
      sell_uk_rate:            sellUkRate,
      sell_international_rate: sellInternationalRate,
      blended_rate:            blendedRate,
      pricing_mode:            pricingMode,
      split_is_primary:        splitIsPrimary,
      blended_is_valid:        blendedRate !== null,
      // ── Current cost split (only when stored — not re-derived on retrieval) ─
      current_uk_rate:         current_uk_rate,
      current_intl_rate:       current_intl_rate,
    });

  } catch (err) {
    console.error("Error loading quote:", err);
    res.status(500).json({ error: "Failed to load quote" });
  }
});

module.exports = router;
