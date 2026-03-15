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
        Monthly_Volume:    opts.monthly_volume   || 0,
        Transaction_Count: opts.transaction_count || 0,
        Current_Rate:      opts.current_rate != null ? opts.current_rate : 0,
        Quoted_Rate:       opts.quoted_rate  || 0,
        Quote_Source:      opts.quote_source || "Unknown",
        Quote_Status:      "Generated",
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

module.exports = { createLead };
