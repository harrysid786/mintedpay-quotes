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
    forceSplitThreshold: 0.40,  // split is primary if intl > 40%
  },
  standard: {
    targetMargin:      0.30,
    minDomestic:       1.60,
    minInternational:  3.00,
    forceSplitThreshold: 0.35,  // split is primary if intl > 35%
  },
  conservative: {
    targetMargin:      0.45,
    minDomestic:       1.90,
    minInternational:  3.20,
    forceSplitThreshold: 0.30,  // split is primary if intl > 30%
  },
};

// ── getSetting ────────────────────────────────────────────────
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
    wespell:       0.0435,
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
    volumeMargins: [
      { maxVol: 50000,    margin: 0.60 },
      { maxVol: 200000,   margin: 0.40 },
      { maxVol: Infinity, margin: 0.25 },
    ],
    fixedFeeTiers: [
      { maxVol: 100000,   fee: 10 },
      { maxVol: 200000,   fee: 8  },
      { maxVol: Infinity, fee: 5  },
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
// Returns an object:
//   splitIsPrimary  {boolean} — true when intl volume crosses the profile threshold
//   blendedIsValid  {boolean} — true when blendedRate is not null (real data exists)
//   mode            {string}  — "split_primary" | "blended_primary" | "split_indicative"
//
// Modes explained:
//   "split_primary"    — intlFrac >= profile threshold AND real data exists.
//                        Split rates are the main output. Blended is secondary/hidden.
//   "blended_primary"  — intlFrac < profile threshold AND blendedRate is not null.
//                        Blended rate is the main output. Split rates are supporting.
//   "split_indicative" — no real intlFrac available (intlFrac is null).
//                        Split rates still shown as indicative, blended suppressed.
//
function decidePricingMode(intlFrac, blendedRate, profileName, settings) {
  if (!settings) settings = getPricingSettings();
  const profile      = settings.profiles[profileName] || settings.profiles.standard;
  const blendedIsValid = blendedRate !== null;

  // No real international proportion data available
  if (intlFrac === null) {
    return {
      splitIsPrimary: false,
      blendedIsValid,
      mode: "split_indicative",
    };
  }

  // intlFrac is real — check against profile split threshold
  if (intlFrac >= profile.splitThreshold) {
    return {
      splitIsPrimary: true,
      blendedIsValid,
      mode: "split_primary",
    };
  }

  // intlFrac is real but below threshold
  return {
    splitIsPrimary: false,
    blendedIsValid,
    mode: blendedIsValid ? "blended_primary" : "split_indicative",
  };
}

// ── calculateRegionalRates ────────────────────────────────────
// Derives UK and International sell rates using:
//   true_cost = regional_base_cost + wespellCost (reused from existing engine)
//   target_sell_rate = true_cost + profile.targetMargin
//   final_sell_rate = max(target_sell_rate, profile.min*)
// Returns: { trueUkCost, trueInternationalCost, sellUkRate, sellInternationalRate }
function calculateRegionalRates(wespellCost, profileName, settings) {
  if (!settings) settings = getPricingSettings();
  const profile  = settings.profiles[profileName] || settings.profiles.standard;

  // True cost per region = regional base cost + Wespell cost
  const trueUkCost            = settings.baseCosts.uk            + wespellCost;
  const trueInternationalCost = settings.baseCosts.international + wespellCost;

  // Target sell rate = true cost + profile target margin
  const targetUkRate            = trueUkCost            + profile.targetMargin;
  const targetInternationalRate = trueInternationalCost + profile.targetMargin;

  // Final sell rate = max(target, profile floor)
  const sellUkRate            = Math.ceil(Math.max(targetUkRate,            profile.minDomestic)    * 100) / 100;
  const sellInternationalRate = Math.ceil(Math.max(targetInternationalRate, profile.minInternational) * 100) / 100;

  return {
    trueUkCost:            Math.round(trueUkCost            * 10000) / 10000,
    trueInternationalCost: Math.round(trueInternationalCost * 10000) / 10000,
    sellUkRate,
    sellInternationalRate,
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
  // Proxy: non-debit cards are predominantly international-issued
  if (csvDebitFracIsReal && debitFrac >= 0 && debitFrac <= 1) {
    const proxyIntlFrac = 1 - debitFrac;
    const ukFrac = debitFrac;
    const blended = (ukFrac * sellUkRate) + (proxyIntlFrac * sellInternationalRate);
    return Math.round(blended * 100) / 100;
  }

  // Case 3: only hardcoded default available — no real data, do not fabricate
  return null;
}

// intlFrac          — optional 0-1 proportion of international transactions
//                     (from lead.intlPercentage / 100). null when not available.
// csvDebitFracIsReal — true when debitFrac came from real CSV card-mix detection,
//                     false when it is the hardcoded 0.70 default.
// profileName        — "aggressive" | "standard" | "conservative". Defaults to "standard".
// settingsOverride   — optional settings object from admin UI. null = use getPricingSettings().
function calculateQuote(vol, cnt, debitFrac, curFees, intlFrac, csvDebitFracIsReal, profileName, settingsOverride) {
  if (intlFrac === undefined) intlFrac = null;
  if (csvDebitFracIsReal === undefined) csvDebitFracIsReal = false;

  // ── Single source of truth — override when admin has applied local changes ──
  const settings = settingsOverride || getPricingSettings();

  // Validate and default profileName against resolved settings
  if (!profileName || !settings.profiles[profileName]) profileName = "standard";
  if (!vol || vol <= 0 || !cnt || cnt <= 0) return null;

  const profile  = settings.profiles[profileName];
  const rules    = settings.globalRules;

  const avgTx = vol / cnt;

  // ── 1. TRUE COST ────────────────────────────────────────────
  const interchangeRate = (debitFrac * 0.20) + ((1 - debitFrac) * 0.30);
  const costRate = interchangeRate + 0.13 + 0.10;

  // ── 2. FIXED COST PER TRANSACTION ──────────────────────────
  const gatewayTier = rules.gatewayFeeTiers.find(t => vol < t.maxVol) || rules.gatewayFeeTiers[rules.gatewayFeeTiers.length - 1];
  const gatewayFee  = gatewayTier.fee;

  const wespellCost = settings.baseCosts.wespell;
  const costFixed   = gatewayFee + wespellCost;

  // ── 2b. REGIONAL RATES — uses selected profile ────────────────
  const regional = calculateRegionalRates(wespellCost, profileName, settings);

  // ── 2c. BLENDED RATE — only when real mix data exists ─────────
  // calculateBlendedRate returns null when only the hardcoded default is available.
  const blendedRate = calculateBlendedRate(
    regional.sellUkRate,
    regional.sellInternationalRate,
    intlFrac,
    csvDebitFracIsReal,
    debitFrac
  );

  // ── 2d. PRICING MODE DECISION — uses selected profile threshold ──
  const pricingDecision = decidePricingMode(intlFrac, blendedRate, profileName, settings);

  // ── 3. MINIMUM MARGIN PROTECTION ──────────────────────────
  const minimumMargin  = rules.minMargin;
  const minAllowedRate = costRate + minimumMargin;

  // ── 4. CALCULATE QUOTE RATE ───────────────────────────────
  let quoteRate;
  let currentRate = null;

  if (curFees && curFees > 0) {
    // Competitor undercut
    currentRate = (curFees / vol) * 100;
    const targetRate = currentRate * rules.undercutMultiplier;
    quoteRate = Math.max(targetRate, minAllowedRate);
  } else {
    // Volume-based pricing — margin sourced from settings
    const volMarginTier = rules.volumeMargins.find(t => vol < t.maxVol) || rules.volumeMargins[rules.volumeMargins.length - 1];
    quoteRate = costRate + volMarginTier.margin;
  }

  // ── 5. RATE FLOOR ─────────────────────────────────────────
  quoteRate = Math.max(quoteRate, rules.rateFloor);

  // ── 6. FIXED FEE TIERS ───────────────────────────────────
  const fixedFeeTier = rules.fixedFeeTiers.find(t => vol < t.maxVol) || rules.fixedFeeTiers[rules.fixedFeeTiers.length - 1];
  let fixedFee = fixedFeeTier.fee;

  // ── 6b. ENFORCE MINIMUM FIXED FEE (CRITICAL) ──────────
  fixedFee = Math.max(fixedFee, rules.fixedFeeMinimum);

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
    rate:                   quoteRate,
    fixed_fee:              fixedFee,
    avgTx:                  Math.round(avgTx * 100) / 100,
    current_rate:           currentRate !== null ? Math.round(currentRate * 100) / 100 : null,
    monthly_saving:         monthlySaving !== null ? Math.round(monthlySaving * 100) / 100 : null,
    yearly_saving:          yearlySaving  !== null ? Math.round(yearlySaving  * 100) / 100 : null,
    true_uk_cost:            regional.trueUkCost,
    true_international_cost: regional.trueInternationalCost,
    sell_uk_rate:            regional.sellUkRate,
    sell_international_rate: regional.sellInternationalRate,
    blended_rate:            blendedRate,
    pricing_mode:            pricingDecision.mode,
    split_is_primary:        pricingDecision.splitIsPrimary,
    blended_is_valid:        pricingDecision.blendedIsValid,
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
    const profileName = effectiveSettings.profiles[pricing_profile] ? pricing_profile : "standard";

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
        (quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at, expiry_date, vol, cnt, avgTx, cur, debitFrac, intlFrac, addons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      intlFrac !== null ? intlFrac : null,
      addons
    );

    // Zoho push moved to /api/leads/:id/push-zoho — no longer auto-fires on calculate

    // Only expose final rate and savings — no cost breakdown
    // Extended: also include regional rates, blended rate, and pricing mode decision.
    // Existing fields preserved unchanged for backward compatibility.
    res.json({
      success:                true,
      quote_id:               quote_id,
      // ── Existing fields (unchanged) ────────────────────────────
      rate:                   result.rate,
      fixed_fee:              result.fixed_fee,
      current_rate:           result.current_rate,
      monthly_saving:         result.monthly_saving,
      yearly_saving:          result.yearly_saving,
      // ── New regional pricing fields (Steps 1–3) ────────────────
      true_uk_cost:            result.true_uk_cost,
      true_international_cost: result.true_international_cost,
      sell_uk_rate:            result.sell_uk_rate,
      sell_international_rate: result.sell_international_rate,
      blended_rate:            result.blended_rate,
      // ── Pricing mode decision (Step 3) ────────────────────────
      pricing_mode:            result.pricing_mode,
      split_is_primary:        result.split_is_primary,
      blended_is_valid:        result.blended_is_valid,
      // ── Profile used (for audit / UI display) ─────────────────
      pricing_profile:         profileName,
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
