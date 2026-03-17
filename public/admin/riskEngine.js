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
  function checkQualification(country, industry) {
    const c = (country  || "").trim().toLowerCase();
    const i = (industry || "").trim().toLowerCase();

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

    // Check prohibited industries (hard reject)
    for (const pi of PROHIBITED_INDUSTRIES) {
      if (matchesKeyword(i, pi)) {
        return {
          allowed: false,
          reason: `The ${industry} industry is not supported by MintedPay at this time.`,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Full risk evaluation — call on Step 9 (output).
   * @param {Object} lead  – full lead object
   * @returns {{ riskLevel: "low"|"medium"|"high", decision: "accept"|"review"|"reject" }}
   */
  function evaluateRisk(lead) {
    const c = (lead.country  || "").toLowerCase();
    const i = (lead.industry || "").toLowerCase();

    // Hard-reject prohibited entries
    for (const pc of PROHIBITED_COUNTRIES) {
      if (c.includes(pc.toLowerCase())) return { riskLevel: "high", decision: "reject" };
    }
    for (const pi of PROHIBITED_INDUSTRIES) {
      if (matchesKeyword(i, pi)) return { riskLevel: "high", decision: "reject" };
    }

    // ── Scoring ──────────────────────────────────────────────
    let score = 0;

    // Restricted industry — word-based to avoid false positives
    const isRestricted = RESTRICTED_INDUSTRIES.some(ri => matchesKeyword(i, ri));
    if (isRestricted) score += 3;

    // Restricted country
    const isRestrictedCountry = RESTRICTED_COUNTRIES.some(rc => c.includes(rc.toLowerCase()));
    if (isRestrictedCountry) score += 2;

    // International transaction percentage
    const intl = parseFloat(lead.intlPercentage) || 0;
    if      (intl > 70) score += 3;
    else if (intl > 40) score += 1;

    // Chargeback rate
    const cb = parseFloat(lead.chargebackRate) || 0;
    if      (cb > 2.0) score += 3;
    else if (cb > 1.0) score += 2;
    else if (cb > 0.5) score += 1;

    // Refund rate
    const refund = parseFloat(lead.refundRate) || 0;
    if      (refund > 10) score += 2;
    else if (refund >  5) score += 1;

    // Holds customer funds
    if (lead.holdsFunds === "yes") score += 2;

    // Subscription model
    if (lead.paymentTypes === "subscription" || lead.paymentTypes === "both") score += 1;

    // High volume adds marginal risk
    const vol = parseFloat(lead.monthlyVolume) || 0;
    if (vol > 500_000) score += 1;

    // Business age
    const businessAge = parseFloat(lead.businessAge) || 0;
    if      (businessAge < 6)  score += 2;
    else if (businessAge < 12) score += 1;

    // Delivery time
    if (lead.deliveryTime === "delayed") score += 1;

    // ── Map score → risk level / decision ────────────────────
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
