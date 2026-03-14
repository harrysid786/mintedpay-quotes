const express = require("express");
const router  = express.Router();
const db      = require("../db");

router.post("/", (req, res) => {
  try {
    const { quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at } = req.body;
    if (!quote_id) return res.status(400).json({ error: "quote_id is required" });
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30);
    const expiry_date = expiry.toISOString();
    db.prepare(`INSERT OR REPLACE INTO quotes (quote_id, merchant_name, merchant_email, rate, fixed_fee, brand, created_at, expiry_date) VALUES (@quote_id, @merchant_name, @merchant_email, @rate, @fixed_fee, @brand, @created_at, @expiry_date)`).run({ quote_id, merchant_name: merchant_name || "", merchant_email: merchant_email || "", rate: parseFloat(rate) || 0, fixed_fee: parseFloat(fixed_fee) || 0, brand: typeof brand === "object" ? JSON.stringify(brand) : (brand || ""), created_at: created_at || new Date().toISOString(), expiry_date });
    const host = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
    return res.json({ url: `${host}/?quote=${quote_id}`, quote_id, expiry_date });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save quote" });
  }
});

router.get("/:quote_id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM quotes WHERE quote_id = ?").get(req.params.quote_id);
    if (!row) return res.status(404).json({ error: "Quote not found" });
    try { row.brand = JSON.parse(row.brand); } catch (_) {}
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: "Failed to load quote" });
  }
});

module.exports = router;
