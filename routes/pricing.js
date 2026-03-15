const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ═══ SERVER-SIDE PRICING ENGINE ═══
// Mirrors the admin builder logic but runs entirely on the server.
// No tier selection, margin percentages, or cost breakdowns are exposed to the client.

const GW = [
  { ceiling: 100000, f: 0.10 },
  { ceiling: 200000, f: 0.08 },
  { ceiling: Infinity, f: 0.05 }
];
const MK = [
  { ceiling: 10000000, p: 0.20 },
  { ceiling: 30000000, p: 0.16 },
  { ceiling: 50000000, p: 0.12 },
  { ceiling: Infinity, p: 0.10 }
];
const WS_FEE   = 0.050;   // Worldline/Wespell T1 in EUR
const EURGBP   = 0.87;
const IC_D     = 0.20;    // Interchange debit %
const IC_C     = 0.30;    // Interchange credit %
const SCH      = 0.13;    // Scheme fee %
const DEFAULT_DEBIT_FRAC = 0.70;
const DEFAULT_GATE_FEE   = 10;   // pence per tx
const SPLIT_PCT          = 30;   // ideal = minR + (maxR-minR)*30%

function autoGW(vol)  { return GW.find(t => vol <= t.ceiling)  || GW[GW.length - 1]; }
function autoMK(vol)  { return MK.find(t => vol <= t.ceiling)  || MK[MK.length - 1]; }

function calculateRate(vol, cnt, debitFrac, curFees) {
  if (!vol || vol <= 0 || !cnt || cnt <= 0) return null;

  const avgTx      = vol / cnt;
  const gwTier     = autoGW(vol);
  const mkTier     = autoMK(vol * 12);  // MK tiers are annual
  const wsGBP      = WS_FEE * EURGBP;
  const blendedIC  = IC_D * debitFrac + IC_C * (1 - debitFrac);

  // MintedPay cost per month
  const mpMk  = cnt * avgTx * (mkTier.p / 100);
  const mpIc  = cnt * avgTx * (blendedIC / 100);
  const mpSc  = cnt * avgTx * (SCH / 100);
  const mpGw  = cnt * gwTier.f;
  const mpWs  = cnt * wsGBP;
  const mpTot = mpMk + mpIc + mpSc + mpGw + mpWs;

  // Min rate: vol*(minR/100) + (gateFee/100)*cnt = mpTot
  const gateFee = DEFAULT_GATE_FEE;
  const minR = Math.max(0, ((mpTot - (gateFee / 100) * cnt) / vol) * 100);

  // Max rate
  let maxR;
  if (curFees && curFees > 0) {
    maxR = Math.max((curFees / vol) * 100, minR + 0.01);
  } else {
    const typicalRate = debitFrac > 0.8 ? 1.5 : debitFrac < 0.2 ? 2.5 : 2.0;
    maxR = Math.max(typicalRate, minR + 0.5);
  }

  // Ideal rate
  const idealR = minR + (maxR - minR) * (SPLIT_PCT / 100);

  // Round to 2 decimal places
  const rate = Math.ceil(idealR * 100) / 100;

  return {
    rate:      rate,
    fixed_fee: gateFee,
    minR:      Math.round(minR * 100) / 100,
    avgTx:     Math.round(avgTx * 100) / 100,
    blendedIC: Math.round(blendedIC * 1000) / 1000
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

    const result = calculateRate(vol, cnt, debitFrac, cur);
    if (!result) {
      return res.status(400).json({ error: "Unable to calculate rate with the provided data" });
    }

    const quote_id    = generateQuoteId();
    const created_at  = new Date().toISOString();
    const expiry      = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiry_date = expiry.toISOString();

    // Default brand = MintedPay
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

    // Standard addons for public quotes
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

    res.json({
      success:  true,
      quote_id: quote_id
    });

  } catch (err) {
    console.error("Error calculating quote:", err);
    res.status(500).json({ error: "Failed to generate quote" });
  }
});

module.exports = router;
