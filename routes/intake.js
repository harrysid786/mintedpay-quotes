/**
 * MintedPay / Ummah — Stage 1 Pre-Qualification API
 *
 * Standalone questionnaire (qualify.html) → creates a single lead, classifies
 * sector server-side, computes a three-outcome decision, and mints an opaque
 * handoff token. Standard merchants proceed to Stage 2 (pricing calculator);
 * other outcomes are shown in-place on the form.
 *
 * Routes:
 *   POST /api/intake          — create lead, return { decision, token, redirect? }
 *   GET  /api/intake/:token   — PREFILL FIELDS ONLY (never the score, never other leads)
 */

const express = require("express");
const crypto  = require("crypto");
const router  = express.Router();
const db      = require("../db");

// ── Sector classification (provisional seed lists) ─────────────
const PROHIBITED_SECTORS = new Set([
  "adult", "gambling", "weapons", "drugs", "counterfeit",
]);

const RESTRICTED_SECTORS = new Set([
  "travel", "financial", "forex", "crypto", "healthcare", "insurance",
  "alcohol", "luxury", "supplements", "property", "marketplace", "events",
]);

function classifySector(sector) {
  const key = (sector || "").toString().trim().toLowerCase();
  if (PROHIBITED_SECTORS.has(key)) return "prohibited";
  if (RESTRICTED_SECTORS.has(key)) return "restricted";
  return "standard";
}

// ── Helpers ───────────────────────────────────────────────────
function genLeadId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `LEAD-${ts}-${rand}`;
}

function genToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function bool(v) {
  return v === true || v === "true";
}

/**
 * V1 decision logic (evaluated in order).
 *
 * @param {{ sector: string, eligibilityConfirmed: boolean }} input
 * @returns {{ decision: 'standard'|'specialist_review'|'not_a_fit', recommendation: 'qualified'|'review'|'not_a_fit', reasons: string[] }}
 */
function computeDecision(input) {
  if (!input.eligibilityConfirmed) {
    return {
      decision: "not_a_fit",
      recommendation: "not_a_fit",
      reasons: ["Did not confirm business eligibility"],
    };
  }

  const classification = classifySector(input.sector);

  if (classification === "prohibited") {
    return {
      decision: "not_a_fit",
      recommendation: "not_a_fit",
      reasons: ["Sector not supported by our acquiring partners"],
    };
  }

  if (classification === "restricted") {
    return {
      decision: "specialist_review",
      recommendation: "review",
      reasons: ["Sector requires specialist review before quoting"],
    };
  }

  return {
    decision: "standard",
    recommendation: "qualified",
    reasons: ["Standard sector — eligible for instant quote"],
  };
}

function riskFromDecision(decision) {
  if (decision === "standard") return "low";
  if (decision === "specialist_review") return "medium";
  return "high";
}

/** Calculator expects "key|allowed" / "key|restricted"; legacy leads may already store that. */
function industryForPrefill(d) {
  if (d.industry) return d.industry;
  const sector = (d.sector || "").toString().trim();
  if (!sector) return "";
  const cls = classifySector(sector);
  if (cls === "prohibited") return "";
  const suffix = cls === "restricted" ? "restricted" : "allowed";
  return `${sector}|${suffix}`;
}

function brandFromHost(hostname) {
  return (hostname || "").toLowerCase().includes("ummah") ? "ummah" : "minted";
}

// ── POST /api/intake — create the Stage 1 lead ────────────────
router.post("/", (req, res) => {
  try {
    const b = req.body || {};

    const sector = (b.sector || "").toString().trim();
    const eligibilityConfirmed = bool(b.eligibilityConfirmed);
    const currentlyProcessing  = bool(b.currentlyProcessing);

    const { decision, recommendation, reasons } = computeDecision({ sector, eligibilityConfirmed });

    const id    = genLeadId();
    const token = genToken();
    const now   = new Date().toISOString();
    const brand = brandFromHost(req.hostname);

    const data = {
      id,
      source:               "qualify",
      businessName:         (b.businessName || "").toString().trim(),
      contactName:          (b.contactName  || "").toString().trim(),
      email:                (b.email   || "").toString().trim(),
      website:              (b.website || "").toString().trim(),
      sector,
      currentlyProcessing,
      eligibilityConfirmed,
      decision,
      intakeRecommendation: recommendation,
      intakeReasons:        reasons,
      riskLevel:            riskFromDecision(decision),
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
      decision,
      now,
      now,
      0,
      JSON.stringify([]),
      "",
      JSON.stringify(initialActivity),
      brand,
      token
    );

    res.json({
      success: true,
      id,
      token,
      decision,
      reasons,
      redirect: decision === "standard" ? `/pricing.html?intake=${token}` : null,
    });
  } catch (err) {
    console.error("Error creating intake lead:", err);
    res.status(500).json({ error: "Failed to submit" });
  }
});

// ── GET /api/intake/:token — PREFILL FIELDS ONLY ──────────────
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
      industry:            industryForPrefill(d),
      customerBase:        d.customerBase || "",
      merchantType:        d.merchantType || "",
      monthlyVolume:       d.monthlyVolume ?? null,
      avgTransactionValue: d.avgTransactionValue ?? null,
    });
  } catch (err) {
    console.error("Error fetching intake prefill:", err);
    res.status(500).json({ error: "Failed to fetch" });
  }
});

module.exports = router;
module.exports.classifySector = classifySector;
module.exports.computeDecision = computeDecision;
