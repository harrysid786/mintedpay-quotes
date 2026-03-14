const express                  = require("express");
const router                   = express.Router();
const db                       = require("../db");
const { generateAgreementPDF } = require("../pdf/agreementGenerator");
const { sendAgreementEmail }   = require("../emails/sendAgreement");

router.post("/", async (req, res) => {
  try {
    const { quote_id, merchant_name, merchant_email } = req.body;
    if (!quote_id) return res.status(400).json({ error: "quote_id is required" });

    const quote = db.prepare("SELECT * FROM quotes WHERE quote_id = ?").get(quote_id);
    if (!quote) return res.status(404).json({ error: "Quote not found" });

    const acceptance = {
      quote_id,
      merchant_name:  merchant_name  || quote.merchant_name  || "",
      merchant_email: merchant_email || quote.merchant_email || "",
      accepted_at:    new Date().toISOString(),
      ip_address:     req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown",
    };

    db.prepare(`INSERT INTO quote_acceptance (quote_id, merchant_name, merchant_email, accepted_at, ip_address) VALUES (@quote_id, @merchant_name, @merchant_email, @accepted_at, @ip_address)`).run(acceptance);

    const pdfPath = await generateAgreementPDF(quote, acceptance);

    if (acceptance.merchant_email) {
      sendAgreementEmail(quote, pdfPath).catch(err => {
        console.error("Email send failed:", err.message);
      });
    }

    return res.json({ success: true, quote_id, accepted_at: acceptance.accepted_at, pdf: `agreements/Merchant_Agreement_${quote_id}.pdf` });
  } catch (err) {
    console.error("POST /api/quote_acceptance error:", err);
    return res.status(500).json({ error: "Failed to record acceptance" });
  }
});

module.exports = router;
