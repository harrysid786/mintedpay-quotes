const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { updateLeadByQuoteId } = require("../services/zohoCRM");

// ── POST /api/quote_acceptance — record merchant acceptance ───
router.post("/", (req, res) => {
  try {
    const { quote_id, merchant_name, merchant_email, timestamp } = req.body;

    if (!quote_id) {
      return res.status(400).json({ error: "quote_id is required" });
    }

    const quote = db.prepare("SELECT * FROM quotes WHERE quote_id = ?").get(quote_id);
    if (!quote) {
      return res.status(404).json({ error: "Quote not found" });
    }

    if (quote.expiry_date && new Date(quote.expiry_date) < new Date()) {
      return res.status(410).json({
        error: "This quote has expired and can no longer be accepted.",
        expired_at: quote.expiry_date
      });
    }

    const existing = db.prepare("SELECT * FROM quote_acceptance WHERE quote_id = ?").get(quote_id);
    if (existing) {
      return res.status(409).json({
        error: "This quote has already been accepted.",
        accepted_at: existing.accepted_at
      });
    }

    const accepted_at = timestamp || new Date().toISOString();
    const ip_address  = req.headers["x-forwarded-for"] || req.ip || "unknown";

    db.prepare(`
      INSERT INTO quote_acceptance (quote_id, merchant_name, merchant_email, accepted_at, ip_address)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      quote_id,
      merchant_name  || quote.merchant_name  || "",
      merchant_email || quote.merchant_email || "",
      accepted_at,
      ip_address
    );

    console.log(`✅ Quote ${quote_id} accepted by ${merchant_name || "unknown"} at ${accepted_at}`);

    // ── Update Zoho Lead status ──
    updateLeadByQuoteId(quote_id, {
      Quote_Status: "Quote Accepted"
    }).catch(err =>
      console.error("⚠️ Zoho update error (acceptance):", err.message)
    );

    res.json({
      success: true,
      quote_id: quote_id,
      accepted_at: accepted_at
    });

  } catch (err) {
    console.error("Error recording acceptance:", err);
    res.status(500).json({ error: "Failed to record acceptance" });
  }
});

module.exports = router;
