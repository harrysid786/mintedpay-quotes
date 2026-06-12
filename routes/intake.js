/**
 * MintedPay / Ummah — Stage 1 Pre-Qualification API
 *
 * Standalone questionnaire (qualify.html) → creates a single lead, computes an
 * admin-only Qualified / Review / Not-a-fit recommendation SERVER-SIDE (single
 * source of truth), and mints an opaque handoff token. The merchant is then
 * forwarded to Stage 2 (the existing public quote tool) which prefills from the
 * token and UPDATES this same lead (no duplicate).
 *
 * Routes:
 *   POST /api/intake          — create lead, return { token, redirect }
 *   GET  /api/intake/:token   — PREFILL FIELDS ONLY (never the score, never other leads)
 *
 * The merchant never sees the recommendation. The prefill endpoint deliberately
 * returns only the funnel-relevant fields.
 */

const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();
const db      = require("../db");

// ── Helpers ───────────────────────────────────────────────────
function genLeadId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `LEAD-${ts}-${rand}`;
}

function genToken() {
  // Opaque, unguessable. Never the sequential lead id.
  return crypto.randomBytes(24).toString("base64url");
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Server-side qualification ruleset (single source of truth).
 * The merchant figures are self-reported and unverified, so "not_a_fit" is
 * reserved for a failed eligibility declaration (possible prohibited sector);
 * weak economics and risk signals route to "review", not a hard decline.
 *
 * @param {Object} input
 * @param {('allowed'|'restricted')} input.industryGroup
 * @param {boolean} input.eligibilityConfirmed
 * @param {number|null} input.avgTicket
 * @param {('uk'|'eea'|'uk_eea'|'mixed'|'row'|'')} input.customerBase
 * @param {('online'|'inperson'|'both'|'other'|'')} input.merchantType
 * @param {boolean} input.heldFunds
 * @param {boolean} input.frozenAccount
 * @param {('lt05'|'05to1'|'gt1'|'unsure'|'')} input.chargeback
 * @returns {{recommendation:'qualified'|'review'|'not_a_fit', reasons:string[]}}
 */
function computeRecommendation(input) {
  // Hard not-a-fit: did not confirm eligibility (possible prohibited sector).
  if (!input.eligibilityConfirmed) {
    return {
      recommendation: "not_a_fit",
      reasons: ["Did not confirm business eligibility (possible prohibited sector)"],
    };
  }

  const reviewReasons = [];
  if (input.industryGroup === "restricted") reviewReasons.push("Restricted industry — needs manual review");
  if (input.heldFunds)        reviewReasons.push("Funds previously held or withheld by a processor");
  if (input.frozenAccount)    reviewReasons.push("Merchant account previously frozen, terminated, or closed");
  if (input.chargeback === "gt1") reviewReasons.push("Stated chargeback rate above 1%");
  if (input.customerBase === "row") reviewReasons.push("Primarily international (rest of world) customer base");

  if (typeof input.avgTicket === "number" && input.avgTicket > 0) {
    if (input.avgTicket < 10 && (input.merchantType === "inperson" || input.merchantType === "both")) {
      reviewReasons.push("Low average ticket (<£10) on in-person — weak economics");
    } else if (input.avgTicket >= 10 && input.avgTicket < 25) {
      reviewReasons.push("Average ticket £10–£25 — margin-sensitive");
    }
  }

  if (reviewReasons.length) {
    return { recommendation: "review", reasons: reviewReasons };
  }

  const reasons = ["Standard industry"];
  if (typeof input.avgTicket === "number" && input.avgTicket >= 25) reasons.push("Healthy average ticket (≥£25)");
  if (["uk", "eea", "uk_eea"].includes(input.customerBase)) reasons.push("UK/EEA-weighted customer base");
  reasons.push("No processor red flags declared");
  return { recommendation: "qualified", reasons };
}

// Map recommendation → existing risk_level column so current admin badges work.
function riskFromRecommendation(rec) {
  return rec === "qualified" ? "low" : rec === "review" ? "medium" : "high";
}

// ── POST /api/intake — create the Stage 1 lead ────────────────
router.post("/", (req, res) => {
  try {
    const b = req.body || {};

    // industry arrives as the Stage 2 value format "key|allowed" / "key|restricted"
    const industryRaw   = (b.industry || "").toString();
    const industryGroup = industryRaw.split("|")[1] === "restricted" ? "restricted" : "allowed";

    const monthlyVolume = num(b.monthlyVolume);
    const avgTicket     = num(b.avgTransactionValue);

    const recInput = {
      industryGroup,
      eligibilityConfirmed: b.eligibilityConfirmed === true || b.eligibilityConfirmed === "true",
      avgTicket,
      customerBase: (b.customerBase || "").toString(),
      merchantType: (b.merchantType || "").toString(),
      heldFunds:     b.heldFunds === true || b.heldFunds === "true",
      frozenAccount: b.frozenAccount === true || b.frozenAccount === "true",
      chargeback:   (b.chargeback || "").toString(),
    };
    const { recommendation, reasons } = computeRecommendation(recInput);

    const id    = genLeadId();
    const token = genToken();
    const now   = new Date().toISOString();
    const brand = (b.brand || "minted").toString();

    // Lead data mirrors the /api/leads payload shape so admin + Zoho push work
    // identically; intake-specific fields are clearly namespaced.
    const data = {
      id,
      source:              "qualify",            // Stage 1 origin marker
      businessName:        (b.businessName || "").toString().trim(),
      contactName:         (b.contactName  || "").toString().trim(),
      email:               (b.email   || "").toString().trim(),
      phone:               (b.phone   || "").toString().trim(),
      website:             (b.website || "").toString().trim(),
      industry:            industryRaw,
      industry_status:     industryGroup,
      merchantType:        recInput.merchantType,
      customerBase:        recInput.customerBase,
      intl_region:         recInput.customerBase,
      currentProcessor:    (b.currentProcessor || "").toString(),
      monthlyVolume:       monthlyVolume,
      avgTransactionValue: avgTicket,
      // red flags (admin-only)
      redFlags: {
        heldFunds:     recInput.heldFunds,
        frozenAccount: recInput.frozenAccount,
        chargeback:    recInput.chargeback,
      },
      eligibilityConfirmed: recInput.eligibilityConfirmed,
      // recommendation (admin-only — never returned to the merchant)
      intakeRecommendation: recommendation,
      intakeReasons:        reasons,
      riskLevel:            riskFromRecommendation(recommendation),
    };

    const initialActivity = [{
      type: "lead_created",
      via: "qualify",
      timestamp: now,
      id: Math.random().toString(36).substring(7),
    }];

    db.prepare(
      "INSERT INTO leads (id, data, status, risk_level, decision, created_at, updated_at, zoho_pushed, notes, assigned_to, activity, brand, intake_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      JSON.stringify(data),
      "intake",
      data.riskLevel,
      "",
      now,
      now,
      0,
      JSON.stringify([]),
      "",
      JSON.stringify(initialActivity),
      brand,
      token
    );

    // Stage 2 target. pricing.html is the canonical public entry; brand-aware
    // hosting serves the correct brand. Merchant gets the token only.
    res.json({
      success: true,
      id,
      token,
      redirect: `/pricing.html?intake=${token}`,
    });
  } catch (err) {
    console.error("Error creating intake lead:", err);
    res.status(500).json({ error: "Failed to submit" });
  }
});

// ── GET /api/intake/:token — PREFILL FIELDS ONLY ──────────────
// Returns only the funnel-relevant fields needed to prefill Stage 2.
// Never returns the recommendation, reasons, red flags, or any other lead.
router.get("/:token", (req, res) => {
  try {
    const token = req.params.token || "";
    if (!token || token.length < 16) return res.status(404).json({ error: "Not found" });

    const row = db.prepare("SELECT id, data FROM leads WHERE intake_token = ?").get(token);
    if (!row) return res.status(404).json({ error: "Not found" });

    let d = {};
    try { d = JSON.parse(row.data || "{}"); } catch (_) {}

    res.json({
      leadId:              row.id,
      businessName:        d.businessName || "",
      contactName:         d.contactName  || "",
      email:               d.email   || "",
      phone:               d.phone   || "",
      website:             d.website || "",
      industry:            d.industry || "",          // "key|allowed" / "key|restricted"
      customerBase:        d.customerBase || "",       // uk | eea | uk_eea | mixed | row
      merchantType:        d.merchantType || "",       // online | inperson | both | other
      monthlyVolume:       d.monthlyVolume ?? null,
      avgTransactionValue: d.avgTransactionValue ?? null,
    });
  } catch (err) {
    console.error("Error fetching intake prefill:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

module.exports = router;
module.exports.computeRecommendation = computeRecommendation;
