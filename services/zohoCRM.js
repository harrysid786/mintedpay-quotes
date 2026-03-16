/**
 * MintedPay — Zoho CRM Integration Service
 * Connection: zoho_crm_quotes
 *
 * Handles OAuth2 access-token refresh and Lead creation.
 *
 * Required .env variables:
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REFRESH_TOKEN
 *   ZOHO_API_DOMAIN       (default: https://www.zohoapis.eu)
 *   ZOHO_ACCOUNTS_URL     (default: https://accounts.zoho.eu)
 */

// ── In-memory token cache ────────────────────────────────────
let accessToken  = null;
let tokenExpiry  = 0;          // epoch ms

const API_DOMAIN   = () => process.env.ZOHO_API_DOMAIN   || "https://www.zohoapis.eu";
const ACCOUNTS_URL = () => process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.eu";

// ── Refresh the OAuth2 access token ──────────────────────────
async function getAccessToken() {
  // Return cached token if still valid (with 60 s buffer)
  if (accessToken && Date.now() < tokenExpiry - 60_000) {
    return accessToken;
  }

  const params = new URLSearchParams({
    grant_type:    "refresh_token",
    client_id:     process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });

  const res = await fetch(`${ACCOUNTS_URL()}/oauth/v2/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoho token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  if (data.error) {
    throw new Error(`Zoho token error: ${data.error}`);
  }

  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;

  console.log("🔑  Zoho access token refreshed");
  return accessToken;
}

// ── Create a Lead in Zoho CRM ────────────────────────────────
/**
 * @param {Object} opts
 * @param {string} opts.merchant_name
 * @param {string} opts.merchant_email
 * @param {string} opts.quote_id
 * @param {string} opts.quote_link
 * @param {number} opts.monthly_volume
 * @param {number} opts.transaction_count
 * @param {number|null} opts.current_rate
 * @param {number} opts.quoted_rate
 * @param {string} opts.quote_source   – "Admin Quote Builder" | "Public Pricing Tool"
 */
async function createLead(opts) {
  // Guard: skip silently if Zoho env vars are not configured
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    console.warn("⚠️  Zoho CRM env vars missing — skipping lead creation");
    return null;
  }

  const token = await getAccessToken();

  // Split merchant name into First / Last for Zoho's required fields
  const nameParts = (opts.merchant_name || "").trim().split(/\s+/);
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(" ") : "";
  const lastName  = nameParts.length > 1 ? nameParts[nameParts.length - 1] : (nameParts[0] || "Unknown");

  const leadData = {
    data: [
      {
        // ── Standard Zoho fields ──
        Company:    opts.merchant_name || "Unknown",
        Email:      opts.merchant_email || "",
        First_Name: firstName,
        Last_Name:  lastName,
        Lead_Source: "Quote Platform",

        // ── Custom fields (must exist in Zoho CRM layout) ──
        Quote_ID:          opts.quote_id,
        Quote_Link:        opts.quote_link || "",
        Quoted_Rate:       opts.quoted_rate  || 0,
        Quote_Source:      opts.quote_source || "Unknown",
        Quote_Status:      "Quote Generated",
      },
    ],
    trigger: ["workflow"],          // fire any Zoho workflows on insert
  };

  const res = await fetch(`${API_DOMAIN()}/crm/v6/Leads`, {
    method:  "POST",
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(leadData),
  });

  const body = await res.json();

  if (!res.ok || (body.data && body.data[0]?.status === "error")) {
    const detail = body.data?.[0]?.message || JSON.stringify(body);
    throw new Error(`Zoho Lead creation failed: ${detail}`);
  }

  const leadId = body.data?.[0]?.details?.id || "unknown";
  console.log(`✅  Zoho Lead created — ID: ${leadId}  Quote: ${opts.quote_id}`);
  return body;
}

// ── Look up a Lead by Quote_ID (read-only) ──────────────────
/**
 * Returns the first Zoho Lead matching the given quoteId, or null.
 *
 * @param {string} quoteId
 * @returns {Object|null} – Lead record with id, Quote_Status, etc.
 */
async function getLeadByQuoteId(quoteId) {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    return null;
  }
  if (!quoteId) return null;

  const token = await getAccessToken();
  const searchUrl = `${API_DOMAIN()}/crm/v6/Leads/search?criteria=(Quote_ID:equals:${encodeURIComponent(quoteId)})`;

  const searchRes = await fetch(searchUrl, {
    method:  "GET",
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (searchRes.status === 204 || !searchRes.ok) return null;

  const body = await searchRes.json();
  return body.data?.[0] || null;
}

// ── Update an existing Lead by Quote_ID ──────────────────────
/**
 * Searches for a Lead matching the given quoteId, then patches it
 * with the supplied field object.
 *
 * @param {string} quoteId  – e.g. "MP-2026-4821"
 * @param {Object} fields   – key/value pairs to update, e.g. { Quote_Status: "Quote Viewed" }
 * @returns {Object|null}   – Zoho API response body, or null if skipped / not found
 */
async function updateLeadByQuoteId(quoteId, fields) {
  // Guard: skip if Zoho env vars are not configured
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    console.warn("⚠️  Zoho CRM env vars missing — skipping lead update");
    return null;
  }

  if (!quoteId || !fields || Object.keys(fields).length === 0) {
    console.warn("⚠️  updateLeadByQuoteId called with empty quoteId or fields — skipping");
    return null;
  }

  const token = await getAccessToken();

  // ── 1. Search for the Lead by Quote_ID ──────────────────────
  const searchUrl = `${API_DOMAIN()}/crm/v6/Leads/search?criteria=(Quote_ID:equals:${encodeURIComponent(quoteId)})`;

  const searchRes = await fetch(searchUrl, {
    method:  "GET",
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
  });

  // 204 = no matching records
  if (searchRes.status === 204) {
    console.warn(`⚠️  Zoho Lead not found for Quote_ID: ${quoteId}`);
    return null;
  }

  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`Zoho Lead search failed (${searchRes.status}): ${text}`);
  }

  const searchBody = await searchRes.json();
  const lead = searchBody.data?.[0];

  if (!lead || !lead.id) {
    console.warn(`⚠️  Zoho Lead not found for Quote_ID: ${quoteId}`);
    return null;
  }

  const leadId = lead.id;

  // ── 2. Update the Lead ──────────────────────────────────────
  const updatePayload = {
    data: [
      {
        id: leadId,
        ...fields,
      },
    ],
    trigger: ["workflow"],
  };

  const updateRes = await fetch(`${API_DOMAIN()}/crm/v6/Leads`, {
    method:  "PUT",
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updatePayload),
  });

  const updateBody = await updateRes.json();

  if (!updateRes.ok || (updateBody.data && updateBody.data[0]?.status === "error")) {
    const detail = updateBody.data?.[0]?.message || JSON.stringify(updateBody);
    throw new Error(`Zoho Lead update failed for ${quoteId}: ${detail}`);
  }

  console.log(`✅  Zoho Lead updated — ID: ${leadId}  Quote: ${quoteId}  Fields: ${Object.keys(fields).join(", ")}`);
  return updateBody;
}

module.exports = { createLead, getLeadByQuoteId, updateLeadByQuoteId };
