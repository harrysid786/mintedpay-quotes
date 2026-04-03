"use strict";
const express = require("express");
const router  = express.Router();
const https   = require("https");
const qs      = require("querystring");

const CLIENT_ID    = process.env.STRIPE_TEST_CLIENT_ID;
const SECRET_KEY   = process.env.STRIPE_TEST_SECRET_KEY;
const REDIRECT_URI = process.env.STRIPE_REDIRECT_URI || "https://mintedpay-quotes.onrender.com/api/stripe/callback";

// ── GET /api/stripe/connect ───────────────────────────────────────
// Redirects merchant to Stripe OAuth authorisation page
// Supports both v1 (/oauth/authorize) and v2 (/oauth/v2/authorize)
router.get("/connect", (req, res) => {
  if (!CLIENT_ID) return res.status(500).json({ error: "Stripe Connect not configured" });
  const params = qs.stringify({
    response_type: "code",
    client_id:     CLIENT_ID,
    scope:         "read_write",
    redirect_uri:  REDIRECT_URI,
  });
  // Try v2 first (newer Stripe accounts / sandboxes)
  res.redirect(`https://connect.stripe.com/oauth/v2/authorize?${params}`);
});

// ── GET /api/stripe/callback ──────────────────────────────────────
// Stripe redirects here after merchant authorises
router.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/pricing-stripe-test.html?stripe_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect("/pricing-stripe-test.html?stripe_error=No+authorisation+code+received");
  }

  try {
    // Exchange code for access token (works for both v1 and v2)
    const tokenData = await stripePost("https://connect.stripe.com/oauth/token", {
      grant_type: "authorization_code",
      code,
    });

    if (tokenData.error) throw new Error(tokenData.error_description || tokenData.error);

    // v1 returns access_token, v2 returns stripe_user_id + we use platform secret key
    const accessToken = tokenData.access_token || SECRET_KEY;
    const accountId   = tokenData.stripe_user_id;

    if (!accessToken && !accountId) throw new Error("No access token or account ID in response");

    // Pull last 90 days of balance transactions
    const since = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
    const headers = { Authorization: `Bearer ${accessToken}` };
    // For v2, add Stripe-Account header
    if (accountId && !tokenData.access_token) headers["Stripe-Account"] = accountId;

    const txns = await stripeGet(
      `https://api.stripe.com/v1/balance_transactions?limit=100&type=charge&created[gte]=${since}`,
      accessToken,
      accountId && !tokenData.access_token ? accountId : null
    );

    const result = processTransactions(txns.data || []);
    const encoded = encodeURIComponent(JSON.stringify(result));
    res.redirect(`/pricing-stripe-test.html?stripe_data=${encoded}`);

  } catch (e) {
    console.error("Stripe callback error:", e.message);
    res.redirect(`/pricing-stripe-test.html?stripe_error=${encodeURIComponent(e.message)}`);
  }
});

// ── Helpers ───────────────────────────────────────────────────────
function stripeGet(url, secretKey, accountId) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { Authorization: `Bearer ${secretKey}` },
    };
    if (accountId) opts.headers["Stripe-Account"] = accountId;
    https.get(url, opts, (r) => {
      let data = "";
      r.on("data", (c) => (data += c));
      r.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function stripePost(url, body) {
  return new Promise((resolve, reject) => {
    const postData = qs.stringify({ ...body });
    const urlObj   = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname,
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        Authorization:    `Bearer ${SECRET_KEY}`,
      },
    };
    const req = https.request(opts, (r) => {
      let data = "";
      r.on("data", (c) => (data += c));
      r.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function processTransactions(txns) {
  let vol = 0, cnt = 0, fees = 0;
  const cardData = {};

  txns.forEach((t) => {
    if (t.type !== "charge") return;
    const amt = t.amount / 100;
    const fee = t.fee    / 100;
    vol  += amt;
    fees += fee;
    cnt++;
    const brand = (t.source?.card?.brand || "unknown").toLowerCase();
    const key   = classCard(brand);
    if (!cardData[key]) cardData[key] = { vol: 0, cnt: 0 };
    cardData[key].vol += amt;
    cardData[key].cnt++;
  });

  const debitKeys  = ["visa_debit", "mc_debit", "maestro"];
  let debitVol = 0;
  debitKeys.forEach((k) => { if (cardData[k]) debitVol += cardData[k].vol; });
  const debitFrac  = vol > 0 ? debitVol / vol : 0.70;
  const currentRate = fees > 0 && vol > 0 ? (fees / vol) * 100 : 0;

  return {
    vol:         Math.round(vol   * 100) / 100,
    cnt,
    cur:         Math.round(fees  * 100) / 100,
    debitFrac:   Math.round(debitFrac * 10000) / 10000,
    intlFrac:    null,
    currentRate: Math.round(currentRate * 10000) / 10000,
    cardData,
    processor:   "Stripe",
    source:      "stripe_connect",
  };
}

function classCard(s) {
  s = (s || "").toLowerCase();
  if (s.includes("amex") || s.includes("american_express")) return "amex";
  if (s.includes("visa") && s.includes("debit"))             return "visa_debit";
  if (s.includes("visa"))                                     return "visa_credit";
  if ((s.includes("master") || s.includes("mc")) && s.includes("debit")) return "mc_debit";
  if (s.includes("maestro"))                                  return "maestro";
  if (s.includes("master") || s.includes("mc"))              return "mc_credit";
  return "mixed";
}

module.exports = router;
