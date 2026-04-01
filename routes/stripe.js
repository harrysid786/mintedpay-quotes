"use strict";
const express = require("express");
const router  = express.Router();
const https   = require("https");
const qs      = require("querystring");

const CLIENT_ID   = process.env.STRIPE_CLIENT_ID;
const SECRET_KEY  = process.env.STRIPE_SECRET_KEY;
const REDIRECT_URI = process.env.STRIPE_REDIRECT_URI || "https://mintedpay-quotes.onrender.com/api/stripe/callback";

// ── GET /api/stripe/connect ───────────────────────────────────────
// Redirects merchant to Stripe OAuth authorisation page
router.get("/connect", (req, res) => {
  if (!CLIENT_ID) return res.status(500).json({ error: "Stripe Connect not configured" });
  const params = qs.stringify({
    response_type: "code",
    client_id:     CLIENT_ID,
    scope:         "read_only",
    redirect_uri:  REDIRECT_URI,
  });
  res.redirect(`https://connect.stripe.com/oauth/authorize?${params}`);
});

// ── GET /api/stripe/callback ──────────────────────────────────────
// Stripe redirects here after merchant authorises
router.get("/callback", async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/pricing-stripe.html?stripe_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect("/pricing-stripe.html?stripe_error=No+authorisation+code+received");
  }

  try {
    // Exchange code for access token
    const tokenData = await stripePost("https://connect.stripe.com/oauth/token", {
      grant_type: "authorization_code",
      code,
    });

    const accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("No access token in response");

    // Pull last 90 days of balance transactions (includes fees)
    const since = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
    const txns  = await stripeGet(
      `https://api.stripe.com/v1/balance_transactions?limit=100&type=charge&created[gte]=${since}`,
      accessToken
    );

    // Process into vol / cnt / fees / card mix
    const result = processTransactions(txns.data || []);

    // Redirect back to pricing tool with data encoded in URL
    const encoded = encodeURIComponent(JSON.stringify(result));
    res.redirect(`/pricing-stripe.html?stripe_data=${encoded}`);

  } catch (e) {
    console.error("Stripe callback error:", e.message);
    res.redirect(`/pricing-stripe.html?stripe_error=${encodeURIComponent(e.message)}`);
  }
});

// ── Helpers ───────────────────────────────────────────────────────
function stripeGet(url, secretKey) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    };
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
    const amt = t.amount / 100;       // Stripe amounts in pence
    const fee = t.fee    / 100;
    vol  += amt;
    fees += fee;
    cnt++;

    // Card brand from reporting_category or description
    const brand = (t.source?.card?.brand || "unknown").toLowerCase();
    const key   = classCard(brand);
    if (!cardData[key]) cardData[key] = { vol: 0, cnt: 0 };
    cardData[key].vol += amt;
    cardData[key].cnt++;
  });

  const debitKeys  = ["visa_debit", "mc_debit", "maestro"];
  let debitVol = 0;
  debitKeys.forEach((k) => { if (cardData[k]) debitVol += cardData[k].vol; });
  const debitFrac = vol > 0 ? debitVol / vol : 0.70;
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
