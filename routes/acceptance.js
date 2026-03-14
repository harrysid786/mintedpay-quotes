const express                       = require("express");
const router                        = express.Router();
const db                            = require("../db");
const { generateAgreementPDF }      = require("../pdf/agreementGenerator");
const { sendAgreementEmail }        = require("../emails/sendAgreement");

// ── POST /api/quote_acceptance ────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { quote_id, merchant_name, merchant_email } = req.body;

    if (!quote_id) {
      return res.status(400).json({ error: "quote_id is required" });
    }

    // Load the original quote from DB
    const quote = db.prepare("SELECT * FROM quotes WHERE quote_id = ?").get(quote_id);
    if (!quote) {
      return res.status(404).json({
        error: "Quote not found. The link may be invalid or the quote may have been deleted."
      });
    }

    // ── Validation 1: Block expired quotes ───────────────────
    if (quote.expiry_date) {
      const expiry = new Date(quote.expiry_date);
      if (expiry < new Date()) {
        return res.status(410).json({
          error:      "This quote has expired and can no longer be accepted.",
          expired_at: quote.expiry_date,
          quote_id,
        });
      }
    }

    // ── Validation 2: Block duplicate acceptances ─────────────
    const existing = db.prepare(
      "SELECT id, accepted_at FROM quote_acceptance WHERE quote_id = ? LIMIT 1"
    ).get(quote_id);
    if (existing) {
      return res.status(409).json({
        error:       "This quote has already been accepted and cannot be accepted again.",
        accepted_at: existing.accepted_at,
        quote_id,
      });
    }

    // Build acceptance record
    const acceptance = {
      quote_id,
      merchant_name:  merchant_name  || quote.merchant_name  || "",
      merchant_email: merchant_email || quote.merchant_email || "",
      accepted_at:    new Date().toISOString(),
      ip_address:     req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
    };

    // Persist acceptance
    db.prepare(`
      INSERT INTO quote_acceptance (quote_id, merchant_name, merchant_email, accepted_at, ip_address)
      VALUES (@quote_id, @merchant_name, @merchant_email, @accepted_at, @ip_address)
    `).run(acceptance);

    console.log(`📝  Acceptance recorded for ${quote_id}`);

    // Generate agreement PDF
    const pdfPath = await generateAgreementPDF(quote, acceptance);
    console.log(`📄  Agreement PDF saved: ${pdfPath}`);

    // Email to merchant (non-blocking — don't fail the response if email fails)
    const emailAddress = acceptance.merchant_email;
    if (emailAddress) {
      sendAgreementEmail(quote, pdfPath).catch(err => {
        console.error("⚠️   Email send failed (acceptance still recorded):", err.message);
      });
    } else {
      console.warn("⚠️   No merchant email — skipping email send");
    }

    return res.json({
      success:     true,
      quote_id,
      accepted_at: acceptance.accepted_at,
      pdf:         `agreements/Merchant_Agreement_${quote_id}.pdf`,
    });
  } catch (err) {
    console.error("POST /api/quote_acceptance error:", err);
    return res.status(500).json({ error: "Failed to record acceptance" });
  }
});

module.exports = router;
