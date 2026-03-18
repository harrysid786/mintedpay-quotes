/**
 * MintedPay — Risk Engine (Client-Side)
 * Exposed as window.RiskEngine
 *
 * Usage:
 *   RiskEngine.checkQualification(country, industry)  → { allowed, reason? }
 *   RiskEngine.evaluateRisk(lead)                      → { riskLevel, decision }
 */
(function () {
  "use strict";

  // ── Prohibited (hard reject) ──────────────────────────────
  const PROHIBITED_INDUSTRIES = [
    "illegal drugs", "drugs", "narcotics",
    "weapons", "arms", "firearms", "ammunition",
    "counterfeit", "counterfeit goods",
    "fraud", "scam",
    "hate speech", "hate",
    "human trafficking", "trafficking",
    "child exploitation",
  ];

  const PROHIBITED_COUNTRIES = [
    "Iran", "North Korea", "Syria", "Cuba",
  ];

  // ── Restricted Countries (elevated risk / review) ────────────
  const RESTRICTED_COUNTRIES = [
    "Russia", "Pakistan", "Bangladesh", "Afghanistan", "Somalia",
    "Yemen", "Venezuela", "Myanmar", "Libya", "Iraq", "Lebanon",
    "South Sudan",
  ];

  // ── Restricted (elevated risk / review) ──────────────────
  const RESTRICTED_INDUSTRIES = [
    "adult", "pornography", "escort",
    "gambling", "casino", "betting", "lottery",
    "crypto", "cryptocurrency", "bitcoin", "nft",
    "financial services", "forex", "fx trading", "investment",
    "travel", "tour operator", "tourism", "airline",
    "subscription", "subscriptions",
    "marketplace", "marketplaces", "crowdfunding",
    "nutraceutical", "supplements",
    "vaping", "e-cigarette", "tobacco",
    "firearms accessories",
  ];

  // ── Industry Categories ────────────────────────────────────
  const INDUSTRY_CATEGORIES = [
    { value: "ecommerce", label: "E-commerce / Online Retail" },
    { value: "saas", label: "SaaS / Software" },
    { value: "retail", label: "Retail / In-person" },
    { value: "hospitality", label: "Hospitality / Food & Drink" },
    { value: "professional_services", label: "Professional Services" },
    { value: "healthcare", label: "Healthcare" },
    { value: "education", label: "Education" },
    { value: "travel", label: "Travel & Tourism" },
    { value: "marketplace", label: "Marketplace / Platform" },
    { value: "subscription", label: "Subscription Services" },
    { value: "charity", label: "Charity / Non-profit" },
    { value: "financial_services", label: "Financial Services" },
    { value: "gaming", label: "Gaming / Entertainment" },
    { value: "crypto", label: "Cryptocurrency / Blockchain" },
    { value: "adult", label: "Adult Content" },
    { value: "other", label: "Other" },
  ];

  /**
   * Phrase-aware matching — handles both single words and multi-word phrases.
   * Checks: exact match | space-prefixed | space-suffixed | substring.
   * This lets "illegal drugs" match "illegal drugs distribution" and
   * "financial services" match "financial services platform", while still
   * catching single-word entries like "crypto" in "crypto payment gateway".
   * @param {string} text
   * @param {string} keyword
   * @returns {boolean}
   */
  function matchesKeyword(text, keyword) {
    if (!text || !keyword) return false;
    const t = text.toLowerCase();
    const k = keyword.toLowerCase();
    return t === k || t.includes(` ${k}`) || t.includes(`${k} `) || t.includes(k);
  }

  /**
   * Quick qualification gate — call on Step 1 before advancing.
   * @param {string} country
   * @param {string} industry
   * @returns {{ allowed: boolean, restricted?: boolean, reason?: string }}
   */
  function checkQualification(country, industry, industryDetail) {
    const c = (country       || "").trim().toLowerCase();
    // Combine industryDetail + industry so both are checked
    const iBase   = (industry       || "").trim().toLowerCase();
    const iDetail = (industryDetail || "").trim().toLowerCase();
    const i = iDetail ? iDetail + " " + iBase : iBase;

    // Check prohibited countries (hard reject)
    for (const pc of PROHIBITED_COUNTRIES) {
      if (c.includes(pc.toLowerCase())) {
        return {
          allowed: false,
          reason: `Operations in ${country} are not currently supported by MintedPay.`,
        };
      }
    }

    // Check restricted countries (elevated risk)
    for (const rc of RESTRICTED_COUNTRIES) {
      if (c.includes(rc.toLowerCase())) {
        return {
          allowed: true,
          restricted: true,
          reason: "This country has elevated risk requirements. You may continue but additional review will be required.",
        };
      }
    }

    // Check prohibited industries (hard reject) — checked against combined string
    for (const pi of PROHIBITED_INDUSTRIES) {
      if (matchesKeyword(i, pi)) {
        return {
          allowed: false,
          reason: `The ${industry || industryDetail} industry is not supported by MintedPay at this time.`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Full risk evaluation — called at Step 10 after all steps complete.
   * @param {Object} lead  – full lead object
   * @returns {{ riskLevel: "low"|"medium"|"high", decision: "accept"|"review"|"reject" }}
   */
  function evaluateRisk(lead) {
    const c = (lead.country  || "").toLowerCase();

    // ── Industry: combine industry + industryDetail for matching ────────────
    // industryDetail is a free-text refinement field (e.g. "Medical Cannabis Retail").
    // We check both so that prohibited/restricted terms entered in either field are caught.
    const industryBase   = (lead.industry       || "").toLowerCase();
    const industryDetail = (lead.industryDetail || "").toLowerCase();
    // Combined string used for all industry matching — checked as a whole
    const i = industryDetail ? industryDetail + " " + industryBase : industryBase;

    // ── HARD REJECTS — bypass scoring, return immediately ───────────────────
    // Prohibited country → always reject
    for (const pc of PROHIBITED_COUNTRIES) {
      if (c.includes(pc.toLowerCase())) {
        return { riskLevel: "high", decision: "reject" };
      }
    }
    // Prohibited industry (checked against combined industry string) → always reject
    for (const pi of PROHIBITED_INDUSTRIES) {
      if (matchesKeyword(i, pi)) {
        return { riskLevel: "high", decision: "reject" };
      }
    }

    // ── POINT SCORING ────────────────────────────────────────────────────────
    let score = 0;

    // ── Industry: restricted → +3 ────────────────────────────────────────────
    // Checked against combined industry string (industryDetail + industry)
    const isRestricted = RESTRICTED_INDUSTRIES.some(ri => matchesKeyword(i, ri));
    if (isRestricted) score += 3;

    // ── Country: restricted → +2 ─────────────────────────────────────────────
    const isRestrictedCountry = RESTRICTED_COUNTRIES.some(rc => c.includes(rc.toLowerCase()));
    if (isRestrictedCountry) score += 2;

    // ── International transactions % ─────────────────────────────────────────
    // >70% = high cross-border exposure → +3
    // >40% = elevated cross-border exposure → +1
    const intl = parseFloat(lead.intlPercentage) || 0;
    if      (intl > 70) score += 3;
    else if (intl > 40) score += 1;

    // ── Chargeback rate % ────────────────────────────────────────────────────
    // >2.0% = critical (above card scheme thresholds) → +3
    // >1.0% = elevated → +2
    // >0.5% = marginal → +1
    const cb = parseFloat(lead.chargebackRate) || 0;
    if      (cb > 2.0) score += 3;
    else if (cb > 1.0) score += 2;
    else if (cb > 0.5) score += 1;

    // ── Refund rate % ────────────────────────────────────────────────────────
    // >10% = high refund risk → +2
    // >5%  = moderate refund risk → +1
    const refund = parseFloat(lead.refundRate) || 0;
    if      (refund > 10) score += 2;
    else if (refund >  5) score += 1;

    // ── Holds customer funds ─────────────────────────────────────────────────
    // Funds-holding increases settlement risk → +2
    if (lead.holdsFunds === "yes") score += 2;

    // ── Subscription / recurring billing ─────────────────────────────────────
    // Subscription models have higher chargeback potential → +1
    if (lead.paymentTypes === "subscription" || lead.paymentTypes === "both") score += 1;

    // ── High monthly volume ──────────────────────────────────────────────────
    // >£500k/mo = large exposure → +1
    const vol = parseFloat(lead.monthlyVolume) || 0;
    if (vol > 500_000) score += 1;

    // ── Business age ─────────────────────────────────────────────────────────
    // FIX: businessAge is stored as an enum string, NOT a number.
    // Do NOT use parseFloat — map each value explicitly.
    // less_than_6  → startup, highest risk → +2
    // 6_to_12      → early stage → +1
    // 1_to_2       → established enough → +0
    // 2_plus       → established → +0
    const businessAge = lead.businessAge || "";
    if      (businessAge === "less_than_6") score += 2;
    else if (businessAge === "6_to_12")     score += 1;
    // "1_to_2" and "2_plus" → no points added

    // ── Delivery time ────────────────────────────────────────────────────────
    // Delayed delivery (days/weeks after payment) = higher chargeback risk → +1
    if (lead.deliveryTime === "delayed") score += 1;

    // ── MAP SCORE → RISK LEVEL AND DECISION ──────────────────────────────────
    // score 0–2   → LOW    → ACCEPT
    // score 3–5   → MEDIUM → ACCEPT (or REVIEW if restricted industry)
    // score 6+    → HIGH   → REJECT (or REVIEW if restricted industry)
    //
    // Restricted industries are never auto-rejected by score — they go to REVIEW.
    // Only prohibited industries and countries trigger an automatic REJECT.
    let riskLevel, decision;

    if (score >= 6) {
      riskLevel = "high";
      decision  = isRestricted ? "review" : "reject";
    } else if (score >= 3) {
      riskLevel = "medium";
      decision  = isRestricted ? "review" : "accept";
    } else {
      riskLevel = "low";
      decision  = "accept";
    }

    return { riskLevel, decision };
  }

  // ── Export ────────────────────────────────────────────────
  window.RiskEngine = {
    checkQualification,
    evaluateRisk,
    PROHIBITED_INDUSTRIES,
    RESTRICTED_INDUSTRIES,
    PROHIBITED_COUNTRIES,
    RESTRICTED_COUNTRIES,
    INDUSTRY_CATEGORIES,
  };
})();
