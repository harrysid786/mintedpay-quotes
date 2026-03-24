const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { createLead } = require("../services/zohoCRM");

// ═══ SERVER-SIDE PRICING ENGINE ═══
// All cost assumptions, margins, and undercut logic are server-only.
// The frontend receives only the final rate and savings values.

const DEFAULT_DEBIT_FRAC = 0.70;

// ── Regional base costs (interchange + scheme fees) ───────────
// Used only for the regional sell rate outputs.
// The existing blended costRate logic below is unchanged.
const REGIONAL_BASE_COST = {
  uk:            1.10,   // UK-issued cards
  eea:           1.60,   // EEA-issued cards (used internally; rolled into intl for now)
  international: 2.60,   // Rest of World / non-UK
};

// ── Pricing profiles ──────────────────────────────────────────
// Existing margin/floor logic extracted as named profiles.
// The route handler selects Standard by default (matching existing behaviour).
const PRICING_PROFILES = {
  aggressive: {
    targetMargin:      0.20,
    minDomestic:       1.40,
    minInternational:  2.50,
    forceSplitThreshold: 0.40,
  },
  standard: {
    targetMargin:      0.30,
    minDomestic:       1.60,
    minInternational:  3.00,
    forceSplitThreshold: 0.35,
  },
  conservative: {
    targetMargin:      0.45,
    minDomestic:       1.90,
    minInternational:  3.20,
    forceSplitThreshold: 0.30,
  },
  // ── Acquisition profile ───────────────────────────────────────
  // Used for merchant-facing indicative quotes. Optimises for conversion.
  // Rates are clearly labelled as indicative — final pricing subject to underwriting.
  acquisition: {
    targetMargin:      0.15,
    minDomestic:       1.39,
    minInternational:  2.49,
    forceSplitThreshold: 0.35,
  },
};

// ── Adyen Interchange++ cost structure ───────────────────────
// Interchange and scheme fees are pass-through (not our margin).
// Acquirer markup and gateway fee ARE our cost components.

// Interchange rates (pass-through, approximate Visa/MC blended averages)
const INTERCHANGE = {
  ukDebit:   0.20,   // UK-issued debit (regulated, ~0.20%)
  ukCredit:  0.30,   // UK-issued credit (~0.30%)
  intl:      1.50,   // Non-UK issued cards (EEA ~0.80%, RoW ~1.50–2.50%, blended ~1.50%)
};

// Scheme fees (pass-through, Visa/MC network assessment, approximate)
const SCHEME_FEE = 0.13; // ~0.13% blended

// EUR/GBP conversion rate — used for Wespell EUR-denominated fees.
// NOTE: EUR_GBP_RATE is read from the DB settings table via getSetting() in calculateQuote,
// but PUT /settings does NOT currently persist this key (it only saves base_costs, profiles,
// global_rules, intl_rules, blended_rules).
// Until a settings UI step adds proper persistence, this can only be set via direct DB insert:
//   INSERT INTO settings (key, value) VALUES ('EUR_GBP_RATE', '0.86');
// The DEFAULT_EUR_GBP_RATE constant below is always the safe fallback.
const DEFAULT_EUR_GBP_RATE = 0.86;

// ── Payment method cost support ──────────────────────────────
// Costs for non-standard payment methods (pass-through or fixed).
// Cards / Apple Pay / Google Pay use the standard IC++ card path.
// If payment_method is not supplied, defaults to "card".
const PAYMENT_METHOD_COSTS = {
  card:          { type: "ic_plus_plus" },           // standard card path
  apple_pay:     { type: "ic_plus_plus" },           // same as card
  google_pay:    { type: "ic_plus_plus" },           // same as card
  amex:          { type: "pct",   pct: 2.75 },       // 2.75% flat
  pay_by_bank:   { type: "fixed", fixedGBP: 0.40 }, // £0.40 per tx
  wechat_pay:    { type: "pct",   pct: 3.00 },       // 3.00% flat
  alipay:        { type: "pct",   pct: 3.00 },       // 3.00% flat
};

// ═══ COST ENGINE HELPERS ═══════════════════════════════════════

// ── Adyen gateway fee per transaction (GBP) ──────────────────
// Based on monthly transaction count.
// Tiers: 0–100k → £0.10 | 100k–200k → £0.08 | 200k+ → £0.05
const ADYEN_GATEWAY_FEE_TIERS = [
  { maxTxns: 100000,   feeGBP: 0.10 },
  { maxTxns: 200000,   feeGBP: 0.08 },
  { maxTxns: Infinity, feeGBP: 0.05 },
];

function getAdyenGatewayFeePerTx(txnsMonthly) {
  const tier = ADYEN_GATEWAY_FEE_TIERS.find(t => txnsMonthly <= t.maxTxns)
            || ADYEN_GATEWAY_FEE_TIERS[ADYEN_GATEWAY_FEE_TIERS.length - 1];
  return tier.feeGBP;
}

// ── Adyen acquiring markup — true progressive waterfall ───────
// Waterfall by monthly card volume (GBP):
//   First £10M  at 0.20%
//   Next  £20M  at 0.16%  (£10M–£30M)
//   Next  £20M  at 0.12%  (£30M–£50M)
//   Above £50M  at 0.10%
//
// Returns monthly GBP cost and effective % for transparency.
const ADYEN_MARKUP_WATERFALL = [
  { upTo: 10_000_000,  pct: 0.20 },
  { upTo: 30_000_000,  pct: 0.16 },
  { upTo: 50_000_000,  pct: 0.12 },
  { upTo: Infinity,    pct: 0.10 },
];

function getAdyenMarkupWaterfallCost(volumeMonthly) {
  // Returns total monthly GBP cost of the waterfall markup.
  let remaining = volumeMonthly;
  let totalCost = 0;
  let prevBand  = 0;
  for (const band of ADYEN_MARKUP_WATERFALL) {
    const bandSize = band.upTo === Infinity ? remaining : Math.min(remaining, band.upTo - prevBand);
    if (bandSize <= 0) break;
    totalCost += (bandSize * band.pct) / 100;
    remaining -= bandSize;
    prevBand   = band.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(totalCost * 100) / 100;
}

function getAdyenMarkupEffectivePct(volumeMonthly) {
  // Effective blended markup % across the whole volume.
  if (!volumeMonthly || volumeMonthly <= 0) return 0;
  return Math.round((getAdyenMarkupWaterfallCost(volumeMonthly) / volumeMonthly) * 10000) / 100;
}

// ── Wespell per-transaction fee helpers ──────────────────────
// Wespell charges a per-tx fee in EUR, tiered by monthly tx count.
// Low-margin clause: if margin is thin, fee switches to 35% of net
// margin per tx (min 0.0035 EUR/tx), whichever is LOWER.
//
// Note: "lower" protects Wespell from below-cost situations while
// capping our cost when margin is tight.
// Wespell flat fee — always €0.05 per transaction regardless of volume.
const WESPELL_FLAT_FEE_EUR = 0.05;

// ── FUTURE ENHANCEMENT: Wespell margin-share helpers ─────────
// These functions implement the Wespell margin-share clause:
//   actualWespell = min(baseFee, max(netMargin × 0.35, 0.0035))
//
// They are NOT called anywhere in live quote generation.
// Wespell is currently priced at base tier only (wespellModeUsed = "base").
// Margin-share logic can be re-enabled here once the rest of the quote
// flow is stable and the commercial model is confirmed.
//
function getWespellMarginShareFeePerTx(netMarginPerTxEUR) {
  // 35% of net margin, minimum 0.0035 EUR.
  // If margin is zero or negative, return the minimum (safe floor).
  const marginShare = (netMarginPerTxEUR > 0 ? netMarginPerTxEUR : 0) * 0.35;
  return Math.max(marginShare, 0.0035);
}

function getActualWespellFeePerTx(baseFeeEUR, marginShareFeeEUR) {
  // Actual fee = min(base, margin_share) — lower of the two.
  return Math.min(baseFeeEUR, marginShareFeeEUR);
}

// ── Fixed cost to effective rate % ───────────────────────────
// Converts a per-tx fixed cost (GBP) into an effective percentage
// of gross monthly volume, for apples-to-apples comparison with
// percentage-based cost components.
//
// Formula: (fixedPerTxGBP × txnsMonthly / grossMonthly) × 100
function fixedCostToRatePct(fixedPerTxGBP, txnsMonthly, grossMonthly) {
  if (!grossMonthly || grossMonthly <= 0 || !txnsMonthly || txnsMonthly <= 0) return 0;
  return Math.round(((fixedPerTxGBP * txnsMonthly) / grossMonthly) * 10000) / 100;
}

// ── buildCostEngine ───────────────────────────────────────────
// Master cost calculation. Replaces the old single-line costRate formula.
// Returns a fully structured cost breakdown object.
//
// Parameters:
//   vol            — monthly GBP card volume
//   cnt            — monthly transaction count
//   debitFrac      — 0–1 fraction of UK debit cards (real CSV data preferred)
//   intlFrac       — 0–1 fraction of international cards (null = unknown)
//   eurGbpRate     — EUR/GBP FX rate (default DEFAULT_EUR_GBP_RATE)
//   paymentMethod  — optional string from PAYMENT_METHOD_COSTS keys
//
// Returns structured cost breakdown — see inline comments on fields.
//
function buildCostEngine(vol, cnt, debitFrac, intlFrac, eurGbpRate, paymentMethod) {
  eurGbpRate    = eurGbpRate    || DEFAULT_EUR_GBP_RATE;
  paymentMethod = paymentMethod || "card";
  const methodCost = PAYMENT_METHOD_COSTS[paymentMethod] || PAYMENT_METHOD_COSTS.card;

  const txnsMonthly = cnt;
  const avgTxGBP    = cnt > 0 ? vol / cnt : 0;

  // ── Adyen acquiring markup (waterfall) ────────────────────
  const adyenMarkupMonthlyCostGBP = getAdyenMarkupWaterfallCost(vol);
  const adyenMarkupPctEffective   = getAdyenMarkupEffectivePct(vol);

  // ── Adyen gateway fee ─────────────────────────────────────
  const adyenGatewayFeePerTxGBP   = getAdyenGatewayFeePerTx(txnsMonthly);
  const adyenGatewayFeePctEffective = fixedCostToRatePct(adyenGatewayFeePerTxGBP, txnsMonthly, vol);

  // ── Interchange (IC++) — card path only ──────────────────
  let interchangePct = 0;
  let schemeFeePct   = 0;

  if (methodCost.type === "ic_plus_plus") {
    const df = (debitFrac !== null && debitFrac > 0 && debitFrac <= 1) ? debitFrac : 0.70;
    const ukBlendedInterchange = (df * INTERCHANGE.ukDebit) + ((1 - df) * INTERCHANGE.ukCredit);
    if (intlFrac !== null && intlFrac > 0 && intlFrac < 1) {
      const domFrac = 1 - intlFrac;
      interchangePct = (domFrac * ukBlendedInterchange) + (intlFrac * INTERCHANGE.intl);
    } else if (intlFrac === 1) {
      interchangePct = INTERCHANGE.intl;
    } else {
      interchangePct = ukBlendedInterchange;
    }
    schemeFeePct = SCHEME_FEE;
  } else if (methodCost.type === "pct") {
    // Flat-rate method (Amex, WeChat, Alipay) — no IC++ breakdown
    interchangePct = methodCost.pct;
    schemeFeePct   = 0;
  }
  // pay_by_bank: fixed GBP, no percentage interchange

  // ── Wespell cost ──────────────────────────────────────────
  // Use base tier fee only. Wespell mode is always "base" for live quote generation.
  // Margin-share logic (getWespellMarginShareFeePerTx / getActualWespellFeePerTx) is
  // retained in the file as a future enhancement but is NOT used here.
  const wespellBasePerTxEUR   = WESPELL_FLAT_FEE_EUR;
  const wespellActualPerTxEUR = wespellBasePerTxEUR;   // base only — margin-share disabled
  const wespellModeUsed       = "base";
  const wespellActualPerTxGBP = wespellActualPerTxEUR * eurGbpRate;
  const wespellPctEffective   = fixedCostToRatePct(wespellActualPerTxGBP, txnsMonthly, vol);

  // ── Fixed-cost totals ─────────────────────────────────────
  // For pay_by_bank: the fixed GBP cost is the "interchange equivalent"
  const payByBankFixedPerTxGBP    = (methodCost.type === "fixed") ? methodCost.fixedGBP : 0;
  const payByBankPctEffective     = fixedCostToRatePct(payByBankFixedPerTxGBP, txnsMonthly, vol);
  const totalFixedPerTxCostsGBP   = adyenGatewayFeePerTxGBP + wespellActualPerTxGBP + payByBankFixedPerTxGBP;

  // ── Totals ────────────────────────────────────────────────
  const totalPctCosts              = interchangePct + schemeFeePct + adyenMarkupPctEffective;
  const fixedAsPct                 = adyenGatewayFeePctEffective + wespellPctEffective + payByBankPctEffective;
  const effectiveTotalCostPct      = Math.round((totalPctCosts + fixedAsPct) * 10000) / 10000;
  const totalEstimatedMonthlyCostGBP = Math.round(
    (((totalPctCosts / 100) * vol) + (totalFixedPerTxCostsGBP * txnsMonthly))
  * 100) / 100;

  return {
    // ── Percentage-based cost components ──────────────────
    interchangePct:              Math.round(interchangePct * 10000) / 10000,
    schemeFeePct:                Math.round(schemeFeePct   * 10000) / 10000,
    adyenMarkupPctEffective:     Math.round(adyenMarkupPctEffective * 10000) / 10000,
    // ── Adyen acquiring cost detail ────────────────────────
    adyenMarkupMonthlyCost:      adyenMarkupMonthlyCostGBP,
    adyenGatewayFeePerTxGBP:     adyenGatewayFeePerTxGBP,
    adyenGatewayFeePctEffective: Math.round(adyenGatewayFeePctEffective * 10000) / 10000,
    // ── Wespell cost detail ────────────────────────────────
    wespellBasePerTxEUR:         Math.round(wespellBasePerTxEUR         * 100000) / 100000,
    wespellMarginSharePerTxEUR:  null,   // future enhancement — not computed in base mode
    wespellActualPerTxEUR:       Math.round(wespellActualPerTxEUR       * 100000) / 100000,
    wespellActualPerTxGBP:       Math.round(wespellActualPerTxGBP       * 100000) / 100000,
    wespellPctEffective:         Math.round(wespellPctEffective          * 10000) / 10000,
    wespellModeUsed,             // "base" | "margin_share"
    // ── Fixed cost totals ──────────────────────────────────
    totalFixedPerTxCostsGBP:     Math.round(totalFixedPerTxCostsGBP * 100000) / 100000,
    // ── Blended totals ─────────────────────────────────────
    totalPctCosts:               Math.round(totalPctCosts    * 10000) / 10000,
    effectiveTotalCostPct:       effectiveTotalCostPct,
    totalEstimatedMonthlyCostGBP,
    // ── Raw inputs (for downstream use) ───────────────────
    eurGbpRate,
    paymentMethod,
    // ── Cost breakdown label map (for display/audit) ──────
    costBreakdown: {
      interchange:  `${Math.round(interchangePct * 100) / 100}%`,
      schemeFees:   `${Math.round(schemeFeePct   * 100) / 100}%`,
      adyenMarkup:  `${Math.round(adyenMarkupPctEffective * 100) / 100}% (effective, waterfall)`,
      adyenGateway: `£${adyenGatewayFeePerTxGBP.toFixed(3)}/tx (${Math.round(adyenGatewayFeePctEffective * 100) / 100}% eff.)`,
      wespell:      `€${wespellActualPerTxEUR.toFixed(5)}/tx → £${wespellActualPerTxGBP.toFixed(5)}/tx [${wespellModeUsed}]`,
      total:        `${effectiveTotalCostPct}% effective`,
    },
  };
}

// ── Acquisition global rules ──────────────────────────────────
// Separate rule set used when profileName === "acquisition".
// Kept isolated so standard/aggressive/conservative are unaffected.
const ACQUISITION_GLOBAL_RULES = {
  minMargin:          0.20,
  undercutMultiplier: 0.72,
  rateFloor:          1.15,
  gatewayFeeTiers: [
    { maxVol: 100000,   fee: 0.10 },
    { maxVol: 200000,   fee: 0.08 },
    { maxVol: Infinity, fee: 0.05 },
  ],
  fixedFeeMinimum: 5,
  // Volume margin add-on when current fees are unknown (cost + margin).
  // Better pricing only unlocks at materially higher volumes.
  volumeMargins: [
    { maxVol:  1_000_000, margin: 0.40 },   // <£1M/month
    { maxVol: 10_000_000, margin: 0.25 },   // £1M–£10M/month
    { maxVol: Infinity,   margin: 0.15 },   // £10M+/month
  ],
  // Merchant-facing fixed fee per transaction (pence).
  // Smaller merchants pay more per transaction to cover fixed costs.
  fixedFeeTiers: [
    { maxVol:  5_000_000, fee: 8 },         // <£5M/month
    { maxVol: 20_000_000, fee: 6 },         // £5M–£20M/month
    { maxVol: Infinity,   fee: 5 },         // £20M+/month
  ],
};

// ── trueCostForBucket ─────────────────────────────────────────
// True cost for a given card bucket:
//   trueCost = interchange + scheme + acquirerMarkup + wespell
// All arguments are percentage-point values (e.g. 0.20 = 0.20%, not 0.002).
// Used by calculateRegionalRates.
function trueCostForBucket(interchangeRate, acquirerMarkup, wespell) {
  return interchangeRate + SCHEME_FEE + acquirerMarkup + wespell;
}

// ── ACQUISITION_PLUS_RULES ────────────────────────────────────
// Public indicative quoting profile — conversion-optimised.
// More aggressive than "acquisition"; not used for final/approved quotes.
// Rates are always clearly labelled as indicative on the frontend.
//
// When current fees are known: undercut by fixed bps based on volume.
// When current fees are not known: add a small acquisition margin to cost.
const ACQUISITION_PLUS_RULES = {
  // ── Undercut bps when current fees are known ──────────────
  // Smaller merchants receive a modest undercut; larger volumes unlock
  // more aggressive pricing. Bands aligned to real merchant scale.
  undercutBpsTiers: [
    { maxVol:   1_000_000, bps: 10 },   // <£1M/month  — conservative
    { maxVol:   5_000_000, bps: 15 },   // £1M–£5M
    { maxVol:  20_000_000, bps: 20 },   // £5M–£20M
    { maxVol: 100_000_000, bps: 28 },   // £20M–£100M
    { maxVol: Infinity,    bps: 35 },   // £100M+
  ],
  maxUndercutBps: 45, // reserved for future admin UI — not enforced yet

  // ── Margin add-on when current fees are NOT known ─────────
  // Cost + margin. Lower margin only unlocks at materially higher volumes.
  acquisitionMarginTiers: [
    { maxVol:   1_000_000, margin: 0.40 },  // <£1M/month
    { maxVol:   5_000_000, margin: 0.28 },  // £1M–£5M
    { maxVol:  20_000_000, margin: 0.18 },  // £5M–£20M
    { maxVol: 100_000_000, margin: 0.12 },  // £20M–£100M
    { maxVol: Infinity,    margin: 0.08 },  // £100M+
  ],

  // Public indicative rate floors
  blendedFloor:     1.10,
  minDomestic:      1.29,
  minInternational: 2.29,
  rateFloor:        1.10,

  // Minimum margin protection (below this → flag warning)
  minMargin: 0.10,

  // ── Merchant-facing fixed fee per transaction (pence) ─────
  // Smaller merchants pay more per transaction to reflect cost reality.
  fixedFeeTiers: [
    { maxVol:   5_000_000, fee: 8 },    // <£5M/month
    { maxVol:  20_000_000, fee: 6 },    // £5M–£20M
    { maxVol: 100_000_000, fee: 5 },    // £20M–£100M
    { maxVol: 250_000_000, fee: 4 },    // £100M–£250M
    { maxVol: Infinity,    fee: 3 },    // £250M+
  ],
  fixedFeeMinimum: 3,

  // Warning thresholds
  contributionMarginWarningPct:   0.08,
  highIntlMixWarningThreshold:    0.40,
};


// Reads a single key from the settings table.
// Returns parsed JSON value when found, fallback when not.
// Safe: if the table doesn't exist yet or value is malformed, fallback is used.
function getSetting(key, fallback) {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row) return fallback;
    return JSON.parse(row.value);
  } catch (e) {
    return fallback;
  }
}

// ── getPricingSettings ────────────────────────────────────────
// Returns the single source-of-truth pricing settings object.
// Each section is loaded from the DB settings table when a row exists,
// falling back to the hardcoded defaults below when not.
//
// This means:
//   - First deploy / empty DB → hardcoded defaults used (no behaviour change)
//   - After admin saves settings → DB values used
//   - If DB row is deleted → falls back to hardcoded defaults automatically
//
function getPricingSettings() {

  // ── Hardcoded defaults (never removed — always the safety net) ────────────
  const DEFAULT_BASE_COSTS = {
    uk:            REGIONAL_BASE_COST.uk,            // 1.10
    eea:           REGIONAL_BASE_COST.eea,           // 1.60
    international: REGIONAL_BASE_COST.international, // 2.60
    // DEPRECATED: wespell flat % is no longer used in any live calculation.
    // buildCostEngine() now uses WESPELL_FLAT_FEE_EUR (€0.05/tx, fixed).
    // This field is kept here only so existing DB rows and PUT /settings calls do not error.
    // It MUST NOT be passed into calculateRegionalRates or any cost formula.
    wespell:       0.0435, // DEPRECATED — do not use in calculations
  };

  const DEFAULT_PROFILES = {
    aggressive: {
      targetMargin:     PRICING_PROFILES.aggressive.targetMargin,          // 0.20
      minDomestic:      PRICING_PROFILES.aggressive.minDomestic,           // 1.40
      minInternational: PRICING_PROFILES.aggressive.minInternational,      // 2.50
      splitThreshold:   PRICING_PROFILES.aggressive.forceSplitThreshold,   // 0.40
    },
    standard: {
      targetMargin:     PRICING_PROFILES.standard.targetMargin,            // 0.30
      minDomestic:      PRICING_PROFILES.standard.minDomestic,             // 1.60
      minInternational: PRICING_PROFILES.standard.minInternational,        // 3.00
      splitThreshold:   PRICING_PROFILES.standard.forceSplitThreshold,     // 0.35
    },
    conservative: {
      targetMargin:     PRICING_PROFILES.conservative.targetMargin,        // 0.45
      minDomestic:      PRICING_PROFILES.conservative.minDomestic,         // 1.90
      minInternational: PRICING_PROFILES.conservative.minInternational,    // 3.20
      splitThreshold:   PRICING_PROFILES.conservative.forceSplitThreshold, // 0.30
    },
    // Acquisition profile — merchant-facing indicative quotes, conversion-optimised
    acquisition: {
      targetMargin:     PRICING_PROFILES.acquisition.targetMargin,         // 0.15
      minDomestic:      PRICING_PROFILES.acquisition.minDomestic,          // 1.39
      minInternational: PRICING_PROFILES.acquisition.minInternational,     // 2.49
      splitThreshold:   PRICING_PROFILES.acquisition.forceSplitThreshold,  // 0.35
    },
  };

  const DEFAULT_GLOBAL_RULES = {
    minMargin:          0.30,
    undercutMultiplier: 0.80,
    rateFloor:          1.30,
    gatewayFeeTiers: [
      { maxVol: 100000,   fee: 0.10 },
      { maxVol: 200000,   fee: 0.08 },
      { maxVol: Infinity, fee: 0.05 },
    ],
    fixedFeeMinimum: 10,
    // Volume margin add-on when current fees are unknown (cost + margin).
    // Admin profiles — bands shifted to reflect real merchant scale.
    // Better margins only unlock at materially higher processing volumes.
    volumeMargins: [
      { maxVol:  1_000_000, margin: 0.60 },   // <£1M/month
      { maxVol: 10_000_000, margin: 0.40 },   // £1M–£10M
      { maxVol: 50_000_000, margin: 0.30 },   // £10M–£50M
      { maxVol: Infinity,   margin: 0.20 },   // £50M+
    ],
    // Merchant-facing fixed fee per transaction (pence).
    fixedFeeTiers: [
      { maxVol:  5_000_000,  fee: 15 },       // <£5M/month
      { maxVol: 20_000_000,  fee: 12 },       // £5M–£20M
      { maxVol: 100_000_000, fee: 10 },       // £20M–£100M
      { maxVol: Infinity,    fee: 8  },       // £100M+
    ],
  };

  const DEFAULT_INTL_RULES = {
    manualOverride:           true,
    countryCoverageThreshold: 0.80,
  };

  const DEFAULT_BLENDED_RULES = {
    suppressAtZero:    true,
    suppressAtHundred: true,
  };

  // ── Load from DB, fall back to defaults ───────────────────────────────────
  // Tiers stored in DB use maxVol: null for Infinity (JSON doesn't support Infinity).
  // Restore Infinity on any tier where maxVol is null.
  function restoreInfinity(tiers) {
    return tiers.map(t => ({ ...t, maxVol: t.maxVol === null ? Infinity : t.maxVol }));
  }

  const dbBaseCosts    = getSetting("base_costs",    DEFAULT_BASE_COSTS);
  const dbProfiles     = getSetting("profiles",      DEFAULT_PROFILES);
  const dbGlobalRules  = getSetting("global_rules",  DEFAULT_GLOBAL_RULES);
  const dbIntlRules    = getSetting("intl_rules",    DEFAULT_INTL_RULES);
  const dbBlendedRules = getSetting("blended_rules", DEFAULT_BLENDED_RULES);

  // Restore Infinity on tier arrays (JSON serialises Infinity as null)
  if (dbGlobalRules.gatewayFeeTiers) dbGlobalRules.gatewayFeeTiers = restoreInfinity(dbGlobalRules.gatewayFeeTiers);
  if (dbGlobalRules.volumeMargins)   dbGlobalRules.volumeMargins   = restoreInfinity(dbGlobalRules.volumeMargins);
  if (dbGlobalRules.fixedFeeTiers)   dbGlobalRules.fixedFeeTiers   = restoreInfinity(dbGlobalRules.fixedFeeTiers);

  return {
    baseCosts:    dbBaseCosts,
    profiles:     dbProfiles,
    globalRules:  dbGlobalRules,
    intlRules:    dbIntlRules,
    blendedRules: dbBlendedRules,
  };
}

// ── decidePricingMode ─────────────────────────────────────────
// Determines whether split pricing (UK + International separate rates)
// should be the PRIMARY presentation, or whether blended can serve as primary
// with split as a supporting metric.
//
// profileNameOrObj — either a profile name string (resolved via settings),
//                    or a plain profile object with a splitThreshold property.
//                    Passing an object ensures public profiles use their own
//                    threshold rather than falling back to "standard".
//
// Returns:
//   splitIsPrimary  {boolean}
//   blendedIsValid  {boolean}
//   mode            {string}  — "split_primary" | "blended_primary" | "split_indicative"
//
// ── decidePricingMode ─────────────────────────────────────────
// Determines how split/blended pricing should be presented.
//
// intlFrac states:
//   null      — unknown mix (no data)       → "split_indicative"
//   0         — confirmed domestic-only     → "domestic_only"
//   0 < x < 1 — real international mix      → "blended_primary" | "split_primary"
//   1         — 100% international          → "split_primary" (or blended_primary)
//
// profileNameOrObj — profile name string or plain profile object with splitThreshold.
//
function decidePricingMode(intlFrac, blendedRate, profileNameOrObj, settings) {
  if (!settings) settings = getPricingSettings();

  const profile = (profileNameOrObj && typeof profileNameOrObj === "object")
    ? profileNameOrObj
    : (settings.profiles[profileNameOrObj] || settings.profiles.standard);

  const blendedIsValid = blendedRate !== null;

  // Unknown mix — no international data at all
  if (intlFrac === null) {
    return { splitIsPrimary: false, blendedIsValid, mode: "split_indicative" };
  }

  // Confirmed 100% domestic — distinct from unknown; no intl rate needed
  if (intlFrac === 0) {
    return { splitIsPrimary: false, blendedIsValid, mode: "domestic_only" };
  }

  // Real international mix — check split threshold
  if (intlFrac >= profile.splitThreshold) {
    return { splitIsPrimary: true, blendedIsValid, mode: "split_primary" };
  }

  return {
    splitIsPrimary: false,
    blendedIsValid,
    mode: blendedIsValid ? "blended_primary" : "split_indicative",
  };
}

// ── calculateRegionalRates ────────────────────────────────────
// Derives UK and International sell rates using real Adyen IC++ cost structure:
//   trueCost(UK)   = ukBlendedInterchange + schemeFee + acquirerMarkupPct + wespellPct
//   trueCost(Intl) = intlInterchange      + schemeFee + acquirerMarkupPct + wespellPct
//   sellRate       = max(trueCost + profile.targetMargin, profile.minRate)
//
// All values are percentage points (e.g. 0.20 = 0.20%, not 0.002).
// acquirerMarkupPct comes directly from the waterfall helper — no legacy tier lookup.
// wespellCost is the effective wespell % from buildCostEngine (already in pct points).
//
function calculateRegionalRates(wespellCost, profileName, settings, vol, debitFrac) {
  if (!settings) settings = getPricingSettings();
  if (!vol) vol = 0;
  const profile  = settings.profiles[profileName] || settings.profiles.standard;

  // Adyen acquiring markup — effective % from true progressive waterfall
  // Returns a percentage-point value (e.g. 0.20 for 0.20%).
  const acquirerMarkupPct = getAdyenMarkupEffectivePct(vol);

  // UK blended interchange: use real debitFrac when provided; fall back to 70/30 default
  const df = (debitFrac !== undefined && debitFrac !== null && debitFrac > 0 && debitFrac <= 1)
    ? debitFrac : 0.70;
  const ukBlendedInterchange = (df * INTERCHANGE.ukDebit) + ((1 - df) * INTERCHANGE.ukCredit);

  // True cost per region — all values in percentage points
  // trueCostForBucket(interchange%, acquirerMarkup%, wespell%) → total cost %
  const trueUkCost            = trueCostForBucket(ukBlendedInterchange, acquirerMarkupPct, wespellCost);
  const trueInternationalCost = trueCostForBucket(INTERCHANGE.intl,     acquirerMarkupPct, wespellCost);

  // Target sell rate = true cost + profile target margin
  const targetUkRate            = trueUkCost            + profile.targetMargin;
  const targetInternationalRate = trueInternationalCost + profile.targetMargin;

  // Final sell rate = max(target, dynamic cost-based floor), ceiled to 2dp
  // Dynamic floor = true cost + profile margin + FLOOR_BUFFER (prevents loss-making deals).
  // profile.minDomestic / profile.minInternational are retained but no longer used as floors here.
  const FLOOR_BUFFER = 0.10;
  const dynamicUkFloor   = trueUkCost            + profile.targetMargin + FLOOR_BUFFER;
  const dynamicIntlFloor = trueInternationalCost + profile.targetMargin + FLOOR_BUFFER;
  const sellUkRate            = Math.ceil(Math.max(targetUkRate,            dynamicUkFloor)   * 100) / 100;
  const sellInternationalRate = Math.ceil(Math.max(targetInternationalRate, dynamicIntlFloor) * 100) / 100;

  return {
    trueUkCost:            Math.round(trueUkCost            * 10000) / 10000,
    trueInternationalCost: Math.round(trueInternationalCost * 10000) / 10000,
    sellUkRate,
    sellInternationalRate,
    acquirerMarkupPct,  // exposed for transparency / audit (% points)
  };
}

// ── calculateBlendedRate ──────────────────────────────────────
// Derives a weighted blended sell rate from real domestic/international
// proportions. Returns null when no reliable mix data exists.
//
// Data sources (in priority order):
//   1. intlFrac — explicitly passed from lead.intlPercentage (most reliable)
//   2. debitFrac from real CSV card-mix detection (csvDebitFracIsReal = true)
//      In this case intlFrac is proxied as (1 - debitFrac), since non-debit
//      cards skew towards international-issued cards.
//   3. Default debitFrac (0.70 hardcoded) — no real data → returns null
//
// Formula:
//   ukFrac   = 1 - intlFrac
//   blended  = (ukFrac × sellUkRate) + (intlFrac × sellInternationalRate)
//
function calculateBlendedRate(sellUkRate, sellInternationalRate, intlFrac, csvDebitFracIsReal, debitFrac) {
  // Case 1: explicit intlFrac passed in (from lead.intlPercentage)
  if (intlFrac !== null && intlFrac >= 0 && intlFrac <= 1) {
    // 0% or 100% international — blended equals one of the displayed rates, adds no value
    if (intlFrac === 0 || intlFrac === 1) return null;
    const ukFrac = 1 - intlFrac;
    const blended = (ukFrac * sellUkRate) + (intlFrac * sellInternationalRate);
    return Math.round(blended * 100) / 100;
  }

  // Case 2: debitFrac came from real CSV card-mix detection
  // Proxy: non-debit cards are predominantly international-issued.
  // Require debitFrac > 0 — a value of exactly 0 means no debit cards detected,
  // not that all volume is international, so it is not a reliable mix signal.
  if (csvDebitFracIsReal && debitFrac > 0 && debitFrac <= 1) {
    const proxyIntlFrac = 1 - debitFrac;
    const ukFrac = debitFrac;
    const blended = (ukFrac * sellUkRate) + (proxyIntlFrac * sellInternationalRate);
    return Math.round(blended * 100) / 100;
  }

  // Case 3: only hardcoded default available — no real data, do not fabricate
  return null;
}

// ── FUTURE ENHANCEMENT: repriceCostEngineWithActualMargin ──────
// NOT called in live quote generation. Retained for future use when
// Wespell margin-share optimisation is re-enabled.
//
// Post-quote Wespell recalculation using the actual final quoted economics.
// Replaces the base-fee estimate with the real net margin derived from
// the actual provisional quoted rate and fixed fee.
//
// If Wespell fee is unchanged, wespellRepricedAfterQuote = false.
// If Wespell fee changes (margin_share kicks in or releases), the caller
// must re-check the floor and margin protections.
//
function repriceCostEngineWithActualMargin(provisionalRate, fixedFeePence, provisionalCostEngine, vol, cnt, eurGbpRate) {
  const avgTxGBP      = cnt > 0 ? vol / cnt : 0;
  const fixedFeeGBP   = fixedFeePence / 100;

  // Actual gross revenue per tx from the provisional quoted rate
  const grossRevPerTxGBP = (avgTxGBP * provisionalRate / 100) + fixedFeeGBP;

  // Total actual cost per tx — pct-based costs + fixed costs from engine
  const pctCostPerTxGBP   = avgTxGBP * (provisionalCostEngine.totalPctCosts / 100);
  const totalCostPerTxGBP = pctCostPerTxGBP + provisionalCostEngine.totalFixedPerTxCostsGBP;

  // Real net margin per tx
  const netMarginPerTxGBP = Math.max(0, grossRevPerTxGBP - totalCostPerTxGBP);
  const netMarginPerTxEUR = netMarginPerTxGBP / eurGbpRate;

  // Recalculate Wespell using actual margin
  const newWespellMarginSharePerTxEUR = getWespellMarginShareFeePerTx(netMarginPerTxEUR);
  const newWespellActualPerTxEUR      = getActualWespellFeePerTx(
    provisionalCostEngine.wespellBasePerTxEUR,
    newWespellMarginSharePerTxEUR
  );
  const newWespellModeUsed  = newWespellActualPerTxEUR === provisionalCostEngine.wespellBasePerTxEUR
    ? "base" : "margin_share";
  const newWespellActualPerTxGBP    = newWespellActualPerTxEUR * eurGbpRate;
  const newWespellPctEffective      = fixedCostToRatePct(newWespellActualPerTxGBP, cnt, vol);

  // Did the Wespell fee change?
  const wespellChanged = Math.abs(newWespellActualPerTxEUR - provisionalCostEngine.wespellActualPerTxEUR) > 0.000001;

  // Rebuild total fixed per-tx cost by replacing only the Wespell component.
  // All other fixed costs (Adyen gateway, pay-by-bank etc.) are unchanged.
  const fixedDelta            = newWespellActualPerTxGBP - provisionalCostEngine.wespellActualPerTxGBP;
  const newTotalFixedPerTxGBP = Math.round((provisionalCostEngine.totalFixedPerTxCostsGBP + fixedDelta) * 100000) / 100000;

  // Rebuild effectiveTotalCostPct generically from all components.
  // This is payment-method-safe: totalPctCosts covers all percentage-based costs,
  // and we recompute the fixed-cost percentage from the updated total fixed per-tx GBP.
  // This replaces the old gateway+wespell-specific approach which would drop
  // pay_by_bank and any future fixed cost components.
  const newFixedAsPct = fixedCostToRatePct(newTotalFixedPerTxGBP, cnt, vol);
  const newEffectiveTotalCostPct = Math.round(
    (provisionalCostEngine.totalPctCosts + newFixedAsPct) * 10000
  ) / 10000;

  return {
    // Updated Wespell fields
    wespellMarginSharePerTxEUR:  Math.round(newWespellMarginSharePerTxEUR * 100000) / 100000,
    wespellActualPerTxEUR:       Math.round(newWespellActualPerTxEUR       * 100000) / 100000,
    wespellActualPerTxGBP:       Math.round(newWespellActualPerTxGBP       * 100000) / 100000,
    wespellPctEffective:         Math.round(newWespellPctEffective          * 10000)  / 10000,
    wespellModeUsed:             newWespellModeUsed,
    // Updated cost totals
    totalFixedPerTxCostsGBP:     newTotalFixedPerTxGBP,
    effectiveTotalCostPct:       newEffectiveTotalCostPct,
    // Margin transparency
    netMarginPerTxGBP:           Math.round(netMarginPerTxGBP * 100000) / 100000,
    netMarginPerTxEUR:           Math.round(netMarginPerTxEUR * 100000) / 100000,
    grossRevPerTxGBP:            Math.round(grossRevPerTxGBP  * 100000) / 100000,
    // Flag
    wespellRepricedAfterQuote:   wespellChanged,
  };
}

// ── computeWarningFlags ───────────────────────────────────────
// Produces an array of warning strings for admin visibility.
// Warnings do not block quote generation — they inform the sales team.
//
function computeWarningFlags(params) {
  const {
    profileName, contributionMarginPct,
    intlFrac, provisionalRate, finalRate, isPublicProfile,
    fixedFeeShortfallAbsorbed,
  } = params;

  const ADMIN_SAFE_FLOOR  = 1.30;
  const CM_WARN_THRESHOLD = (profileName === "acquisition_plus")
    ? ACQUISITION_PLUS_RULES.contributionMarginWarningPct : 0.12;
  const INTL_THRESHOLD    = (profileName === "acquisition_plus")
    ? ACQUISITION_PLUS_RULES.highIntlMixWarningThreshold  : 0.35;

  const flags = [];

  // NOTE: WESPELL_MARGIN_SHARE_ACTIVE removed — margin-share is disabled in live quoting.
  // Wespell always runs in base mode. No margin-share clause is applied.

  if (contributionMarginPct !== null && contributionMarginPct < CM_WARN_THRESHOLD) {
    flags.push(`LOW_CONTRIBUTION_MARGIN: ${(contributionMarginPct * 100).toFixed(2)}% is below the ${(CM_WARN_THRESHOLD * 100).toFixed(0)}% threshold.`);
  }
  if (isPublicProfile && finalRate < ADMIN_SAFE_FLOOR) {
    flags.push(`PUBLIC_QUOTE_BELOW_SAFE_THRESHOLD: Indicative rate ${finalRate}% is below admin safe floor ${ADMIN_SAFE_FLOOR}%. Requires manual review before converting to final quote.`);
  }
  if (intlFrac !== null && intlFrac > INTL_THRESHOLD) {
    flags.push(`HIGH_INTERNATIONAL_MIX: ${(intlFrac * 100).toFixed(0)}% international volume. Blended rate may understate true cost. Review before approving.`);
  }
  if (fixedFeeShortfallAbsorbed) {
    flags.push(`FIXED_FEE_SHORTFALL_ABSORBED_IN_RATE: True per-tx fixed cost exceeds displayed 10p. Shortfall absorbed into percentage rate. Provisional rate ${provisionalRate}% adjusted to ${finalRate}%.`);
  } else if (provisionalRate !== finalRate) {
    flags.push(`RATE_ADJUSTED_AFTER_PROTECTION_LOGIC: Rate adjusted from ${provisionalRate}% to ${finalRate}% after floor/margin protection checks.`);
  }

  return flags;
}
// intlFrac          — optional 0-1 proportion of international transactions
//                     (from lead.intlPercentage / 100). null when not available.
// csvDebitFracIsReal — true when debitFrac came from real CSV card-mix detection,
//                     false when it is the hardcoded 0.70 default.
// profileName        — "aggressive" | "standard" | "conservative" | "acquisition" | "acquisition_plus".
//                     Defaults to "standard".
// settingsOverride   — optional settings object from admin UI. null = use getPricingSettings().
function calculateQuote(vol, cnt, debitFrac, curFees, intlFrac, csvDebitFracIsReal, profileName, settingsOverride) {
  if (intlFrac === undefined) intlFrac = null;
  if (csvDebitFracIsReal === undefined) csvDebitFracIsReal = false;

  const settings = settingsOverride || getPricingSettings();

  // acquisition_plus is a public profile — handled by its own constant ruleset.
  const isPublicProfile = profileName === "acquisition_plus";
  if (!profileName || (!settings.profiles[profileName] && !isPublicProfile)) profileName = "standard";
  if (!vol || vol <= 0 || !cnt || cnt <= 0) return null;

  const avgTx = vol / cnt;

  // ── Select rules ───────────────────────────────────────────
  const rules = isPublicProfile               ? ACQUISITION_PLUS_RULES
              : profileName === "acquisition"  ? ACQUISITION_GLOBAL_RULES
              : settings.globalRules;

  // ════════════════════════════════════════════════════════════
  // PHASE A — COST ENGINE
  //
  // Admin profiles: real debitFrac/intlFrac inputs used.
  // acquisition_plus (public): worst-case cost assumptions applied after
  // buildCostEngine(). This ensures the cost basis is always conservative
  // regardless of the card mix data provided.
  //
  // Worst-case overrides for public quotes:
  //   interchangePct          = INTERCHANGE.intl  (1.50% — highest tier)
  //   schemeFeePct            = SCHEME_FEE         (0.13%)
  //   adyenGatewayFeePerTxGBP = £0.10              (standard card gateway)
  //   wespellActualPerTxEUR   = €0.05              (<=50k txn tier — highest)
  //   wespellModeUsed         = "base"
  //   debitFrac / intlFrac    = ignored for cost basis
  // ════════════════════════════════════════════════════════════
  const eurGbpRate    = getSetting("EUR_GBP_RATE", DEFAULT_EUR_GBP_RATE);
  // NOTE: payment_method is NOT yet wired through the request body.
  // Hardcoded to "card" until request handling is extended (future step).
  const paymentMethod = "card";
  const provisionalCostEngine = buildCostEngine(vol, cnt, debitFrac, intlFrac, eurGbpRate, paymentMethod);

  // ── Worst-case override for acquisition_plus ──────────────
  // Override the tiered/mix-weighted values with hardcoded maximums so the
  // cost basis used for the public quote is always commercially conservative.
  // The overrides do not affect any admin profile calculations.
  const PUBLIC_WORST_CASE_INTERCHANGE_PCT  = INTERCHANGE.intl;           // 1.50%
  const PUBLIC_WORST_CASE_GATEWAY_GBP      = 0.10;                        // £0.10/tx
  const PUBLIC_WORST_CASE_WESPELL_EUR      = 0.05;                        // €0.05/tx (highest base tier)
  const PUBLIC_WORST_CASE_WESPELL_GBP      = PUBLIC_WORST_CASE_WESPELL_EUR * eurGbpRate;
  const PUBLIC_WORST_CASE_WESPELL_PCT      = fixedCostToRatePct(PUBLIC_WORST_CASE_WESPELL_GBP, cnt, vol);
  const PUBLIC_WORST_CASE_GATEWAY_PCT      = fixedCostToRatePct(PUBLIC_WORST_CASE_GATEWAY_GBP, cnt, vol);
  const PUBLIC_WORST_CASE_TOTAL_FIXED_GBP  = PUBLIC_WORST_CASE_GATEWAY_GBP + PUBLIC_WORST_CASE_WESPELL_GBP;
  const PUBLIC_WORST_CASE_TOTAL_FIXED_PCT  = PUBLIC_WORST_CASE_WESPELL_PCT + PUBLIC_WORST_CASE_GATEWAY_PCT;
  const PUBLIC_WORST_CASE_TOTAL_PCT_COSTS  = PUBLIC_WORST_CASE_INTERCHANGE_PCT + SCHEME_FEE
                                           + provisionalCostEngine.adyenMarkupPctEffective;
  const PUBLIC_WORST_CASE_EFFECTIVE_TOTAL  = Math.round(
    (PUBLIC_WORST_CASE_TOTAL_PCT_COSTS + PUBLIC_WORST_CASE_TOTAL_FIXED_PCT) * 10000
  ) / 10000;

  // Apply overrides when public profile — otherwise use real engine
  const finalCostEngineBase = isPublicProfile
    ? (() => {
        // Compute the three derived fields that depend on worst-case inputs.
        // These must be rebuilt here; they cannot be inherited from provisionalCostEngine.

        // totalEstimatedMonthlyCostGBP — recalculated from worst-case totals
        const worstCaseMonthlyGBP = Math.round(
          (((PUBLIC_WORST_CASE_TOTAL_PCT_COSTS / 100) * vol)
          + (PUBLIC_WORST_CASE_TOTAL_FIXED_GBP * cnt))
          * 100
        ) / 100;

        // costBreakdown — rebuilt with worst-case display values
        const worstCaseBreakdown = {
          interchange:  `${PUBLIC_WORST_CASE_INTERCHANGE_PCT}% (worst-case: intl)`,
          schemeFees:   `${SCHEME_FEE}%`,
          adyenMarkup:  `${Math.round(provisionalCostEngine.adyenMarkupPctEffective * 100) / 100}% (effective, waterfall)`,
          adyenGateway: `£${PUBLIC_WORST_CASE_GATEWAY_GBP.toFixed(3)}/tx (${Math.round(PUBLIC_WORST_CASE_GATEWAY_PCT * 100) / 100}% eff.)`,
          wespell:      `€${PUBLIC_WORST_CASE_WESPELL_EUR.toFixed(5)}/tx → £${(PUBLIC_WORST_CASE_WESPELL_GBP).toFixed(5)}/tx [base, worst-case]`,
          total:        `${PUBLIC_WORST_CASE_EFFECTIVE_TOTAL}% effective (worst-case)`,
        };

        return Object.assign({}, provisionalCostEngine, {
          interchangePct:              PUBLIC_WORST_CASE_INTERCHANGE_PCT,
          schemeFeePct:                SCHEME_FEE,
          adyenGatewayFeePerTxGBP:     PUBLIC_WORST_CASE_GATEWAY_GBP,
          adyenGatewayFeePctEffective: PUBLIC_WORST_CASE_GATEWAY_PCT,
          // Fix: wespellBasePerTxEUR must match the forced actual value (€0.05)
          // so base/actual are logically consistent (both 0.05, mode = "base").
          wespellBasePerTxEUR:         PUBLIC_WORST_CASE_WESPELL_EUR,
          wespellActualPerTxEUR:       PUBLIC_WORST_CASE_WESPELL_EUR,
          wespellActualPerTxGBP:       Math.round(PUBLIC_WORST_CASE_WESPELL_GBP * 100000) / 100000,
          wespellPctEffective:         Math.round(PUBLIC_WORST_CASE_WESPELL_PCT  * 10000)  / 10000,
          wespellModeUsed:             "base",
          totalFixedPerTxCostsGBP:     Math.round(PUBLIC_WORST_CASE_TOTAL_FIXED_GBP  * 100000) / 100000,
          totalPctCosts:               Math.round(PUBLIC_WORST_CASE_TOTAL_PCT_COSTS   * 10000)  / 10000,
          effectiveTotalCostPct:       PUBLIC_WORST_CASE_EFFECTIVE_TOTAL,
          // Fix: recalculated from worst-case inputs
          totalEstimatedMonthlyCostGBP: worstCaseMonthlyGBP,
          // Fix: rebuilt display strings from worst-case values
          costBreakdown:               worstCaseBreakdown,
        });
      })()
    : provisionalCostEngine;

  const provisionalCostRate = finalCostEngineBase.effectiveTotalCostPct;

  // ════════════════════════════════════════════════════════════
  // PHASE B — PROVISIONAL QUOTE RATE
  // ════════════════════════════════════════════════════════════
  let provisionalRate;
  let currentRate = null;

  if (isPublicProfile) {
    // acquisition_plus: bps undercut when fees known, else cost + margin band
    if (curFees && curFees > 0) {
      currentRate = (curFees / vol) * 100;
      const undercutTier = rules.undercutBpsTiers.find(t => vol <= t.maxVol)
                        || rules.undercutBpsTiers[rules.undercutBpsTiers.length - 1];
      provisionalRate = currentRate - (undercutTier.bps / 100);
    } else {
      const marginTier = rules.acquisitionMarginTiers.find(t => vol <= t.maxVol)
                      || rules.acquisitionMarginTiers[rules.acquisitionMarginTiers.length - 1];
      provisionalRate  = provisionalCostRate + marginTier.margin;
    }
    provisionalRate = Math.max(provisionalRate, rules.rateFloor);
  } else {
    // Admin profiles: undercut multiplier or volume margin
    const minAllowedRate = provisionalCostRate + rules.minMargin;
    if (curFees && curFees > 0) {
      currentRate     = (curFees / vol) * 100;
      provisionalRate = Math.max(currentRate * rules.undercutMultiplier, minAllowedRate);
    } else {
      const volMarginTier = rules.volumeMargins.find(t => vol < t.maxVol)
                         || rules.volumeMargins[rules.volumeMargins.length - 1];
      provisionalRate     = provisionalCostRate + volMarginTier.margin;
    }
    provisionalRate = Math.max(provisionalRate, rules.rateFloor);
  }

  // Provisional fixed fee
  const fixedFeeTier      = rules.fixedFeeTiers.find(t => vol < t.maxVol)
                         || rules.fixedFeeTiers[rules.fixedFeeTiers.length - 1];
  const provisionalFixedFee = Math.max(fixedFeeTier.fee, rules.fixedFeeMinimum);

  // ════════════════════════════════════════════════════════════
  // PHASE C — FINALISE COST ENGINE
  //
  // For acquisition_plus: finalCostEngineBase already has worst-case
  // overrides applied in Phase A — use it directly.
  // For admin profiles: use provisionalCostEngine as-is.
  // No iterative Wespell repricing. Margin-share is a future enhancement.
  // ════════════════════════════════════════════════════════════
  const finalCostEngine           = finalCostEngineBase;
  const wespellRepricedAfterQuote = false;

  // Capture provisional rate BEFORE Phase D adjustments.
  // This is the rate derived purely from the undercut/margin logic,
  // before floor checks and fixed-fee shortfall absorption.
  const preAdjustmentRate = Math.ceil(provisionalRate * 100) / 100;

  // ════════════════════════════════════════════════════════════
  // PHASE D — FINALISE QUOTE RATE + FIXED FEE
  // ════════════════════════════════════════════════════════════

  // ── Standard floor check (all profiles) ───────────────────
  const minAllowedRate = finalCostEngine.effectiveTotalCostPct + rules.minMargin;
  let quoteRate = Math.max(provisionalRate, minAllowedRate, rules.rateFloor);
  quoteRate     = Math.ceil(quoteRate * 100) / 100;

  // ── acquisition_plus: fixed fee protection ─────────────────
  // Merchant always sees a clean 10p fixed fee regardless of true
  // per-tx fixed cost. Any shortfall is absorbed into the % rate.
  //
  // Uses hardcoded worst-case fixed costs — consistent with Phase A:
  //   gateway  = £0.10 (PUBLIC_WORST_CASE_GATEWAY_GBP)
  //   wespell  = €0.05 × eurGbpRate (PUBLIC_WORST_CASE_WESPELL_GBP)
  //   total    = PUBLIC_WORST_CASE_TOTAL_FIXED_GBP
  //
  // shortfall = max(0, total − £0.10)
  // shortfallPct = (shortfall / avgTx) × 100  [only when avgTx ≥ £1]
  const PUBLIC_DISPLAYED_FIXED_FEE_PENCE = 10;
  const PUBLIC_DISPLAYED_FIXED_FEE_GBP   = PUBLIC_DISPLAYED_FIXED_FEE_PENCE / 100;

  let fixedFeeShortfallAbsorbed = false;

  if (isPublicProfile) {
    const worstCaseTotalFixed = PUBLIC_WORST_CASE_TOTAL_FIXED_GBP;
    if (worstCaseTotalFixed > PUBLIC_DISPLAYED_FIXED_FEE_GBP) {
      const shortfallPerTxGBP = worstCaseTotalFixed - PUBLIC_DISPLAYED_FIXED_FEE_GBP;
      if (avgTx >= 1) {
        const shortfallPct = (shortfallPerTxGBP / avgTx) * 100;
        quoteRate = quoteRate + shortfallPct;
        quoteRate = Math.ceil(quoteRate * 100) / 100;
        fixedFeeShortfallAbsorbed = true;
      }
    }

    // Re-check floor after shortfall adjustment
    const adjustedMin = finalCostEngine.effectiveTotalCostPct + rules.minMargin;
    if (quoteRate < adjustedMin) quoteRate = Math.ceil(adjustedMin * 100) / 100;
  }

  // Fixed fee shown to merchant:
  //   acquisition_plus → always 10p (clean, competitive presentation)
  //   all other profiles → from the volume tier as before
  const fixedFee = isPublicProfile ? PUBLIC_DISPLAYED_FIXED_FEE_PENCE : provisionalFixedFee;

  // ════════════════════════════════════════════════════════════
  // PHASE E — CONTRIBUTION MARGIN
  // Computed from final quoteRate + finalCostEngine.
  // For public profiles, finalCostEngine uses worst-case cost assumptions.
  // ════════════════════════════════════════════════════════════
  const grossRevPerTxGBP   = (avgTx * quoteRate / 100) + (fixedFee / 100);
  const totalCostPerTxGBP  = (avgTx * (finalCostEngine.totalPctCosts / 100))
                            + finalCostEngine.totalFixedPerTxCostsGBP;
  const contribMarginPerTx = Math.round((grossRevPerTxGBP - totalCostPerTxGBP) * 100000) / 100000;
  const contribMarginPct   = grossRevPerTxGBP > 0
    ? Math.round((contribMarginPerTx / grossRevPerTxGBP) * 10000) / 10000
    : null;

  // ════════════════════════════════════════════════════════════
  // PHASE F — REGIONAL RATES (sell-side split)
  //
  // Three cases based on whether real international data exists:
  //
  //   CASE A — intlFrac > 0  (real international mix known)
  //     Both UK and international rates are calculated from real data.
  //     has_real_international_data = true.
  //
  //   CASE B — intlFrac === 0  (confirmed UK domestic)
  //     Only UK rate is derived. International rate is a standard fallback
  //     (minInternational from the active profile), clearly labelled.
  //     has_real_international_data = false.
  //
  //   CASE C — intlFrac === null  (no reliable mix data)
  //     Same as Case B: UK-only derivation, fallback intl rate.
  //     has_real_international_data = false.
  //
  // acquisition_plus uses a synthetic profile so floors match public rules.
  // decidePricingMode receives the profile object directly — not "standard".
  // ════════════════════════════════════════════════════════════

  // Shared synthetic profile for public quotes (used for both calculateRegionalRates
  // and decidePricingMode — ensures consistent thresholds throughout).
  const publicSyntheticProfile = isPublicProfile ? {
    targetMargin:     0,
    minDomestic:      ACQUISITION_PLUS_RULES.minDomestic,      // 1.29%
    minInternational: ACQUISITION_PLUS_RULES.minInternational,  // 2.29%
    splitThreshold:   0.35,
  } : null;

  const syntheticSettings = isPublicProfile
    ? Object.assign({}, settings, {
        profiles: Object.assign({}, settings.profiles, { _ap_public: publicSyntheticProfile }),
      })
    : settings;
  const effectiveProfileName = isPublicProfile ? "_ap_public" : profileName;
  const effectiveProfile     = isPublicProfile ? publicSyntheticProfile
    : (settings.profiles[profileName] || settings.profiles.standard);

  // Fallback international rate for Cases B and C.
  // This is a standard display rate — clearly not derived from merchant data.
  const fallbackInternationalRate = isPublicProfile
    ? ACQUISITION_PLUS_RULES.minInternational     // 2.29%
    : (effectiveProfile.minInternational || 3.00);

  // ── International mix classification ─────────────────────
  // Three distinct states — not collapsed into a single boolean.
  //   "real_international" — intlFrac > 0: real mix data, international present
  //   "domestic_only"      — intlFrac === 0: confirmed UK domestic, no intl
  //   "unknown"            — intlFrac === null: no mix data available
  const intlMixStatus = intlFrac === null   ? "unknown"
                      : intlFrac === 0      ? "domestic_only"
                      :                      "real_international";

  // Derived booleans for convenience
  const hasRealInternationalData = (intlMixStatus === "real_international"); // intlFrac !== null && intlFrac > 0
  const isDomesticOnlyConfirmed  = (intlMixStatus === "domestic_only");      // intlFrac === 0

  let regional;
  let sellUkRate;
  let sellInternationalRate;

  if (hasRealInternationalData) {
    // CASE A — real international mix data exists: derive both rates normally
    regional = calculateRegionalRates(
      finalCostEngine.wespellPctEffective, effectiveProfileName, syntheticSettings, vol, debitFrac
    );
    sellUkRate            = regional.sellUkRate;
    sellInternationalRate = regional.sellInternationalRate;
  } else {
    // CASE B / C — UK domestic only or no reliable mix data.
    // Derive UK rate from real debitFrac (real data should inform UK pricing).
    // For public quotes, the worst-case cost basis is already baked into
    // finalCostEngine, so the UK rate derivation is still conservative.
    regional = calculateRegionalRates(
      finalCostEngine.wespellPctEffective, effectiveProfileName, syntheticSettings, vol, debitFrac
    );
    sellUkRate            = regional.sellUkRate;
    // International rate is the fallback — NOT derived from cost engine assumptions.
    // It is a standard "from X%" display value, not a calculated merchant rate.
    sellInternationalRate = fallbackInternationalRate;
  }

  // Blended rate: only computed when real data supports it (Case A, intlFrac > 0)
  const blendedRate = hasRealInternationalData
    ? calculateBlendedRate(sellUkRate, sellInternationalRate, intlFrac, csvDebitFracIsReal, debitFrac)
    : null;

  // Pricing mode: pass the profile object directly so acquisition_plus uses
  // its own splitThreshold (0.35), not the standard profile's threshold.
  const pricingDecision = decidePricingMode(intlFrac, blendedRate, effectiveProfile, settings);

  // ════════════════════════════════════════════════════════════
  // PHASE G — SAVINGS
  // ════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════
  // PHASE H — CURRENT COST SPLIT
  // ════════════════════════════════════════════════════════════
  let currentUkRate   = null;
  let currentIntlRate = null;
  if (currentRate !== null && intlFrac !== null) {
    if (intlFrac === 0) {
      currentUkRate = Math.round(currentRate * 100) / 100;
    } else if (intlFrac === 1) {
      currentIntlRate = Math.round(currentRate * 100) / 100;
    } else {
      const domFrac      = 1 - intlFrac;
      const df           = (debitFrac > 0 && debitFrac <= 1) ? debitFrac : 0.70;
      const ukBlended    = (df * INTERCHANGE.ukDebit) + ((1 - df) * INTERCHANGE.ukCredit);
      const ukTrueCost   = ukBlended + SCHEME_FEE + finalCostEngine.adyenMarkupPctEffective;
      const intlTrueCost = INTERCHANGE.intl + SCHEME_FEE + finalCostEngine.adyenMarkupPctEffective;
      const weightedCost = (domFrac * ukTrueCost) + (intlFrac * intlTrueCost);
      if (weightedCost > 0) {
        currentUkRate   = Math.round((currentRate * ukTrueCost   / weightedCost) * 100) / 100;
        currentIntlRate = Math.round((currentRate * intlTrueCost / weightedCost) * 100) / 100;
      }
    }
  }

  // ════════════════════════════════════════════════════════════
  // PHASE I — WARNING FLAGS
  // ════════════════════════════════════════════════════════════
  const warningFlags = computeWarningFlags({
    profileName,
    contributionMarginPct: contribMarginPct,
    intlFrac,
    provisionalRate:  preAdjustmentRate,
    finalRate:        quoteRate,
    isPublicProfile,
    fixedFeeShortfallAbsorbed,
  });

  return {
    // ── Existing fields — unchanged, backward compatible ──────
    rate:                    quoteRate,
    fixed_fee:               fixedFee,
    avgTx:                   Math.round(avgTx * 100) / 100,
    current_rate:            currentRate !== null ? Math.round(currentRate * 100) / 100 : null,
    current_uk_rate:         currentUkRate,
    current_intl_rate:       currentIntlRate,
    monthly_saving:          monthlySaving !== null ? Math.round(monthlySaving * 100) / 100 : null,
    yearly_saving:           yearlySaving  !== null ? Math.round(yearlySaving  * 100) / 100 : null,
    true_uk_cost:            regional.trueUkCost,
    true_international_cost: regional.trueInternationalCost,
    sell_uk_rate:            sellUkRate,
    sell_international_rate: sellInternationalRate,
    blended_rate:            blendedRate,
    pricing_mode:            pricingDecision.mode,
    split_is_primary:        pricingDecision.splitIsPrimary,
    blended_is_valid:        pricingDecision.blendedIsValid,
    acquirer_markup:         finalCostEngine.adyenMarkupPctEffective,
    // ── Cost engine (final — worst-case for public, real for admin) ───
    cost_engine:             finalCostEngine,
    // ── New Step 2 fields ─────────────────────────────────────
    provisional_quote_rate:       preAdjustmentRate,
    final_quote_rate:             quoteRate,
    contribution_margin_pct:      contribMarginPct,
    contribution_margin_per_tx:   contribMarginPerTx,
    wespell_repriced_after_quote: wespellRepricedAfterQuote,
    warning_flags:                warningFlags,
    is_public_profile:            isPublicProfile,
    // ── International data quality flags ──────────────────────
    // intl_mix_status distinguishes three cases:
    //   "real_international" — intlFrac > 0: real mix data, both rates calculated
    //   "domestic_only"      — intlFrac === 0: confirmed UK domestic, fallback intl
    //   "unknown"            — intlFrac === null: no mix data, fallback intl
    //
    // has_real_international_data = (intlFrac > 0) — true ONLY when real international mix exists
    // is_domestic_only_confirmed  = (intlFrac === 0)    — true when confirmed domestic
    //
    // sell_international_rate is a calculated rate ONLY when intl_mix_status = "real_international".
    // Otherwise it is a fallback display value (minInternational floor) — not merchant-specific.
    intl_mix_status:              intlMixStatus,
    has_real_international_data:  hasRealInternationalData,
    is_domestic_only_confirmed:   isDomesticOnlyConfirmed,
    fallback_international_rate:  hasRealInternationalData ? null : fallbackInternationalRate,
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
    const { merchant_name, merchant_email, monthly_volume, transaction_count, current_fees, debit_frac, intl_frac, csv_debit_frac_is_real, pricing_profile, settings_override } = req.body;

    if (!merchant_email) {
      return res.status(400).json({ error: "Email address is required" });
    }
    if (!monthly_volume || monthly_volume <= 0) {
      return res.status(400).json({ error: "Monthly volume is required" });
    }
    if (!transaction_count || transaction_count <= 0) {
      return res.status(400).json({ error: "Transaction count is required" });
    }

    const vol      = parseFloat(monthly_volume);
    const cnt      = parseFloat(transaction_count);
    const cur      = parseFloat(current_fees) || 0;
    const debitFrac = (debit_frac !== undefined && debit_frac >= 0 && debit_frac <= 1) ? parseFloat(debit_frac) : DEFAULT_DEBIT_FRAC;

    // intlFrac: 0–1 proportion of international transactions.
    // Sent from admin when lead.intlPercentage is available.
    // null when not supplied — blended rate will be suppressed.
    const intlFrac = (intl_frac !== undefined && intl_frac !== null && intl_frac >= 0 && intl_frac <= 1)
      ? parseFloat(intl_frac)
      : null;

    // csvDebitFracIsReal: true only when debit_frac was derived from real
    // CSV card-mix detection, not from the hardcoded 0.70 default.
    const csvDebitFracIsReal = csv_debit_frac_is_real === true || csv_debit_frac_is_real === "true";

    // profileName: validate against resolved settings, default to "standard".
    // Use override settings for validation if provided.
    const resolvedSettings = (settings_override && typeof settings_override === "object" && settings_override.profiles)
      ? settings_override
      : null;
    const effectiveSettings = resolvedSettings || getPricingSettings();
    // acquisition_plus is a public profile — valid even though it's not in settings.profiles
    const profileName = (pricing_profile === "acquisition_plus")
      ? "acquisition_plus"
      : (effectiveSettings.profiles[pricing_profile] ? pricing_profile : "standard");

    const result = calculateQuote(vol, cnt, debitFrac, cur, intlFrac, csvDebitFracIsReal, profileName, resolvedSettings);
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
        (quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at, expiry_date,
         vol, cnt, avgTx, cur, debitFrac, intlFrac, addons,
         sell_uk_rate, sell_international_rate, blended_rate,
         current_uk_rate, current_intl_rate, pricing_mode, split_is_primary,
         has_real_international_data, is_domestic_only_confirmed, intl_mix_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      intlFrac,
      addons,
      result.sell_uk_rate            ?? null,
      // NOTE: sell_international_rate may be a fallback display value (minInternational),
      // not a rate calculated from the merchant's actual data.
      // Check has_real_international_data in the API response to determine which.
      // When has_real_international_data = false, this value is the profile's
      // minInternational floor — a standard "from X%" display rate only.
      result.sell_international_rate ?? null,
      result.blended_rate            ?? null,
      result.current_uk_rate         ?? null,
      result.current_intl_rate       ?? null,
      result.pricing_mode            ?? null,
      result.split_is_primary        ? 1 : 0,
      result.has_real_international_data  ? 1 : 0,
      result.is_domestic_only_confirmed   ? 1 : 0,
      result.intl_mix_status              ?? null
    );

    // Zoho push moved to /api/leads/:id/push-zoho — no longer auto-fires on calculate

    // NOTE: Step 2 fields (provisional_quote_rate, final_quote_rate, contribution_margin_pct,
    // contribution_margin_per_tx, wespell_repriced_after_quote, warning_flags, is_public_profile)
    // are returned in the API response but NOT persisted to the quotes table.
    // These are operational/audit fields for admin use — they can be re-derived from the stored
    // rate, cost inputs, and profile at any time. Persistence can be added in a future DB migration
    // once the schema is confirmed stable.

    res.json({
      success:                true,
      quote_id:               quote_id,
      // ── Existing fields (unchanged) ────────────────────────────
      rate:                   result.rate,
      fixed_fee:              result.fixed_fee,
      current_rate:           result.current_rate,
      monthly_saving:         result.monthly_saving,
      yearly_saving:          result.yearly_saving,
      // ── Current cost split (new — when intlFrac known) ─────────
      current_uk_rate:        result.current_uk_rate,
      current_intl_rate:      result.current_intl_rate,
      // ── Regional pricing fields ────────────────────────────────
      true_uk_cost:            result.true_uk_cost,
      true_international_cost: result.true_international_cost,
      sell_uk_rate:            result.sell_uk_rate,
      sell_international_rate: result.sell_international_rate,
      blended_rate:            result.blended_rate,
      // ── Pricing mode decision ──────────────────────────────────
      pricing_mode:            result.pricing_mode,
      split_is_primary:        result.split_is_primary,
      blended_is_valid:        result.blended_is_valid,
      // ── Profile and cost transparency ─────────────────────────
      pricing_profile:         profileName,
      acquirer_markup:         result.acquirer_markup,
      // ── New structured cost breakdown ─────────────────────────
      cost_engine:             result.cost_engine,
      // ── Step 2 fields ─────────────────────────────────────────
      provisional_quote_rate:       result.provisional_quote_rate,
      final_quote_rate:             result.final_quote_rate,
      contribution_margin_pct:      result.contribution_margin_pct,
      contribution_margin_per_tx:   result.contribution_margin_per_tx,
      wespell_repriced_after_quote: result.wespell_repriced_after_quote,
      warning_flags:                result.warning_flags,
      is_public_profile:            result.is_public_profile,
      // ── International data quality ─────────────────────────────
      has_real_international_data:  result.has_real_international_data,
      is_domestic_only_confirmed:   result.is_domestic_only_confirmed,
      intl_mix_status:              result.intl_mix_status,
      fallback_international_rate:  result.fallback_international_rate,
    });

  } catch (err) {
    console.error("Error calculating quote:", err);
    res.status(500).json({ error: "Failed to generate quote" });
  }
});

// ── GET /api/settings ────────────────────────────────────────
// Returns the current live settings object (DB values or defaults).
// Used by admin panel to populate the pricing settings form on load.
router.get("/settings", (req, res) => {
  try {
    res.json({ success: true, settings: getPricingSettings() });
  } catch (err) {
    console.error("Error fetching settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// ── PUT /api/settings ─────────────────────────────────────────
// Saves the full settings object to the DB.
// Each section stored as a separate key for granular fallback.
// Infinity in tier maxVol is serialised as null (JSON limitation).
router.put("/settings", (req, res) => {
  try {
    const { baseCosts, profiles, globalRules, intlRules, blendedRules } = req.body;

    // Basic structural validation — each section must be present
    if (!baseCosts || !profiles || !globalRules) {
      return res.status(400).json({ error: "Missing required settings sections" });
    }
    if (!profiles.aggressive || !profiles.standard || !profiles.conservative) {
      return res.status(400).json({ error: "All three profiles are required" });
    }

    // Serialise — Infinity becomes null in JSON; restored on read via restoreInfinity()
    const serialise = obj => JSON.stringify(obj, (_, v) => v === Infinity ? null : v);
    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    db.transaction(() => {
      upsert.run("base_costs",    serialise(baseCosts),    now);
      upsert.run("profiles",      serialise(profiles),     now);
      upsert.run("global_rules",  serialise(globalRules),  now);
      if (intlRules)    upsert.run("intl_rules",    serialise(intlRules),    now);
      if (blendedRules) upsert.run("blended_rules", serialise(blendedRules), now);
    })();

    res.json({ success: true, settings: getPricingSettings() });
  } catch (err) {
    console.error("Error saving settings:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

module.exports = router;
