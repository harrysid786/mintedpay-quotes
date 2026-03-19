const express = require("express");
const router  = express.Router();
const db      = require("../db");

// getPricingSettings is exported from routes/pricing.js alongside the router
const { getPricingSettings } = require("./pricing");

// ── GET /api/settings ─────────────────────────────────────────
// Returns the current live settings (DB values or defaults).
// ?mode=defaults returns hardcoded fallback values only, no DB read.
router.get("/settings", (req, res) => {
  try {
    if (req.query.mode === "defaults") {
      return res.json({ success: true, settings: getPricingSettings._getDefaults() });
    }
    const latestRow = db.prepare(
      "SELECT updated_at FROM settings ORDER BY updated_at DESC LIMIT 1"
    ).get();
    const updatedAt = latestRow ? latestRow.updated_at : null;
    res.json({ success: true, settings: getPricingSettings(), updated_at: updatedAt });
  } catch (err) {
    console.error("Error fetching settings:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// ── PUT /api/settings ─────────────────────────────────────────
// Saves the full settings object to the DB.
router.put("/settings", (req, res) => {
  try {
    const { baseCosts, profiles, globalRules, intlRules, blendedRules } = req.body;

    if (!baseCosts || !profiles || !globalRules) {
      return res.status(400).json({ error: "Missing required settings sections" });
    }
    if (!profiles.aggressive || !profiles.standard || !profiles.conservative) {
      return res.status(400).json({ error: "All three profiles are required" });
    }

    const serialise = obj => JSON.stringify(obj, (_, v) => v === Infinity ? null : v);
    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    db.transaction(() => {
      upsert.run("base_costs",    serialise(baseCosts),    now);
      upsert.run("profiles",      serialise(profiles),     now);
      upsert.run("global_rules",  serialise(globalRules),  now);
      if (intlRules)    upsert.run("intl_rules",    serialise(intlRules),    now);
      if (blendedRules) upsert.run("blended_rules", serialise(blendedRules), now);
    })();

    res.json({ success: true, settings: getPricingSettings(), updated_at: now });
  } catch (err) {
    console.error("Error saving settings:", err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

module.exports = router;
