const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { createLead } = require("../services/zohoCRM");

// ═══ SERVER-SIDE PRICING ENGINE ═══
// All cost assumptions, margins, and undercut logic are server-only.
// The frontend receives only the final rate and savings values.

const DEFAULT_DEBIT_FRAC = 0.70;

function calculateQuote(vol, cnt, debitFrac, curFees) {
  if (!vol || vol <= 0 || !cnt || cnt <= 0) return null;

  const avgTx = vol / cnt;

  // ── 1. TRUE COST ────────────────────────────────────────────
  const interchangeRate = (debitFrac * 0.20) + ((1 - debitFrac) * 0.30);
  const costRate = interchangeRate + 0.13 + 0.10;

  // ── 2. FIXED COST PER TRANSACTION ──────────────────────────
  let gatewayFee;
  if (vol < 100000)       gatewayFee = 0.10;
  else if (vol < 200000)  gatewayFee = 0.08;
  else                    gatewayFee = 0.05;

  const wespellCost = 0.0435;
  const costFixed = gatewayFee + wespellCost;

  // ── 3. MINIMUM MARGIN PROTECTION ──────────────────────────
  const minimumMargin = 0.30;
  const minAllowedRate = costRate + minimumMargin;

  // ── 4. CALCULATE QUOTE RATE ───────────────────────────────
  let quoteRate;
  let currentRate = null;

  if (curFees && curFees > 0) {
    // Competitor undercut: 25% reduction from current rate
    currentRate = (curFees / vol) * 100;
    const targetRate = currentRate * 0.80;
    quoteRate = Math.max(targetRate, minAllowedRate);
  } else {
    // Volume-based pricing
    if (vol < 50000)        quoteRate = costRate + 0.60;
    else if (vol < 200000)  quoteRate = costRate + 0.40;
    else                    quoteRate = costRate + 0.25;
  }

  // ── 5. RATE FLOOR ─────────────────────────────────────────
  quoteRate = Math.max(quoteRate, 1.30);

  // ── 6. FIXED FEE TIERS ───────────────────────────────────
  let fixedFee;
  if (vol < 100000)       fixedFee = 10;
  else if (vol < 200000)  fixedFee = 8;
  else                    fixedFee = 5;

  // ── 7. ROUND FINAL RATE ──────────────────────────────────
  quoteRate = Math.ceil(quoteRate * 100) / 100;

  // ── 8. CALCULATE SAVINGS ─────────────────────────────────
  let monthlySaving = null;
  let yearlySaving  = null;

  if (currentRate !== null) {
    const savingRate = currentRate - quoteRate;
    if (savingRate > 0) {
      monthlySaving = Math.round(((savingRate / 100) * vol) * 100) / 100;
      yearlySaving  = Math.round((monthlySaving * 12) * 100) / 100;
    } else {
      monthlySaving = 0;
      yearlySaving  = 0;
    }
  }

  return {
    rate:           quoteRate,
    fixed_fee:      fixedFee,
    avgTx:          Math.round(avgTx * 100) / 100,
    current_rate:   currentRate !== null ? Math.round(currentRate * 100) / 100 : null,
    monthly_saving: monthlySaving !== null ? Math.round(monthlySaving * 100) / 100 : null,
    yearly_saving:  yearlySaving !== null ? Math.round(yearlySaving * 100) / 100 : null
  };
}

function generateQuoteId() {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `MP-${year}-${rand}`;
}

// ── POST /api/calculate_quote ─────────────────────────────────
router.post("/", (req, res) => {
  try {
    const { merchant_name, merchant_email, monthly_volume, transaction_count, current_fees, debit_frac } = req.body;

    if (!merchant_email) {
      return res.status(400).json({ error: "Email address is required" });
    }
    if (!monthly_volume || monthly_volume <= 0) {
      return res.status(400).json({ error: "Monthly volume is required" });
    }
    if (!transaction_count || transaction_count <= 0) {
      return res.status(400).json({ error: "Transaction count is required" });
    }

    const vol = parseFloat(monthly_volume);
    const cnt = parseFloat(transaction_count);
    const cur = parseFloat(current_fees) || 0;
    const debitFrac = (debit_frac !== undefined && debit_frac >= 0 && debit_frac <= 1) ? parseFloat(debit_frac) : DEFAULT_DEBIT_FRAC;

    const result = calculateQuote(vol, cnt, debitFrac, cur);
    if (!result) {
      return res.status(400).json({ error: "Unable to calculate rate with the provided data" });
    }

    const quote_id    = generateQuoteId();
    const created_at  = new Date().toISOString();
    const expiry      = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiry_date = expiry.toISOString();

    const brandJson = JSON.stringify({
      key: "mintedpay",
      name: "MintedPay",
      nameParts: ["Minted", "Pay"],
      tagline: "Payment Processing Proposal",
      email: "sales@minted.com",
      website: "www.mintedpay.com",
      legal: "MintedPay · Nova Advisory Ireland Limited · sales@minted.com · www.mintedpay.com",
      salesTeam: "MintedPay Sales Team"
    });

    const addons = JSON.stringify({
      addAmex: true,
      amexPct: 3.5,
      amexFixed: 20,
      addFX: true,
      fxPct: 1.5,
      addChargeback: true,
      cbAmt: 15,
      addRefund: true,
      refAmt: 1
    });

    db.prepare(`
      INSERT OR REPLACE INTO quotes
        (quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at, expiry_date, vol, cnt, avgTx, cur, debitFrac, addons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      quote_id,
      merchant_name || "",
      merchant_email,
      result.rate,
      result.fixed_fee,
      brandJson,
      created_at,
      expiry_date,
      vol,
      cnt,
      result.avgTx,
      cur,
      debitFrac,
      addons
    );

    // ── Zoho CRM: create Lead (fire-and-forget, never blocks response) ──
    const origin = process.env.PUBLIC_URL || (req.protocol + "://" + req.get("host"));
    const quoteLink = `${origin}/quote.html?quote=${quote_id}`;

    createLead({
      merchant_name:     merchant_name  || "",
      merchant_email:    merchant_email || "",
      quote_id:          quote_id,
      quote_link:        quoteLink,
      monthly_volume:    vol,
      transaction_count: cnt,
      current_rate:      result.current_rate,
      quoted_rate:       result.rate,
      quote_source:      "Public Pricing Tool",
    }).catch(err => console.error("⚠️  Zoho CRM lead error (pricing):", err.message));

    // Only expose final rate and savings — no cost breakdown
    res.json({
      success:        true,
      quote_id:       quote_id,
      rate:           result.rate,
      fixed_fee:      result.fixed_fee,
      current_rate:   result.current_rate,
      monthly_saving: result.monthly_saving,
      yearly_saving:  result.yearly_saving
    });

  } catch (err) {
    console.error("Error calculating quote:", err);
    res.status(500).json({ error: "Failed to generate quote" });
  }
});

module.exports = router;
