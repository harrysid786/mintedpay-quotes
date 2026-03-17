/**
 * MintedPay — Back Office Leads API
 * Handles CRUD for sales leads plus KYB status transitions.
 *
 * Routes:
 *   GET    /api/leads            — list all leads
 *   POST   /api/leads            — create new lead (draft)
 *   GET    /api/leads/:id        — get single lead
 *   PUT    /api/leads/:id        — update (autosave)
 *   POST   /api/leads/:id/kyb   — mark as kyb_pending
 */

const express = require("express");
const router  = express.Router();
const db      = require("../db");

// ── Helpers ───────────────────────────────────────────────────
function genLeadId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `LEAD-${ts}-${rand}`;
}

function parseRow(row) {
  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch (_) {}
  return {
    id:         row.id,
    status:     row.status     || "draft",
    riskLevel:  row.risk_level || data.riskLevel || "",
    decision:   row.decision   || data.decision   || "",
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
    // spread lead data fields (contact, volume, pricing, etc.)
    ...data,
    // ensure id/status are not overwritten by stale data blob
    id:         row.id,
    status:     row.status || data.status || "draft",
  };
}

// ── GET /api/leads — list leads with optional pagination ──────
// Query params: ?limit=50&offset=0  (defaults: limit 50, offset 0)
// Backward-compatible: omitting params returns first 50 as before.
router.get("/", (req, res) => {
  try {
    const limit  = Math.max(1, parseInt(req.query.limit)  || 50);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const rows = db.prepare(`
      SELECT id, data, status, risk_level, decision, created_at, updated_at
      FROM leads
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare("SELECT COUNT(*) AS n FROM leads").get().n;

    res.json({
      leads:  rows.map(parseRow),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("Error listing leads:", err);
    res.status(500).json({ error: "Failed to list leads" });
  }
});

// ── POST /api/leads — create a new lead ───────────────────────
router.post("/", (req, res) => {
  try {
    const id  = genLeadId();
    const now = new Date().toISOString();
    const payload = { ...req.body, id };
    const status  = payload.status || "draft";

    db.prepare(
      "INSERT INTO leads (id, data, status, risk_level, decision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      JSON.stringify(payload),
      status,
      payload.riskLevel || "",
      payload.decision  || "",
      now,
      now
    );

    res.json({ success: true, id, lead: payload });
  } catch (err) {
    console.error("Error creating lead:", err);
    res.status(500).json({ error: "Failed to create lead" });
  }
});

// ── GET /api/leads/:id — fetch a single lead ──────────────────
router.get("/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });
    res.json(parseRow(row));
  } catch (err) {
    console.error("Error fetching lead:", err);
    res.status(500).json({ error: "Failed to fetch lead" });
  }
});

// ── PUT /api/leads/:id — update / autosave ────────────────────
router.put("/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    let existing = {};
    try { existing = JSON.parse(row.data || "{}"); } catch (_) {}

    const updated = { ...existing, ...req.body };
    const now     = new Date().toISOString();
    const status  = req.body.status  || row.status  || "draft";
    const risk    = req.body.riskLevel || updated.riskLevel || row.risk_level || "";
    const decision= req.body.decision || updated.decision  || row.decision    || "";

    db.prepare(
      "UPDATE leads SET data = ?, status = ?, risk_level = ?, decision = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(updated), status, risk, decision, now, req.params.id);

    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error("Error updating lead:", err);
    res.status(500).json({ error: "Failed to update lead" });
  }
});

// ── POST /api/leads/:id/kyb — mark as KYB pending ────────────
router.post("/:id/kyb", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    const now = new Date().toISOString();
    let data  = {};
    try { data = JSON.parse(row.data || "{}"); } catch (_) {}
    data.status = "kyb_pending";

    db.prepare("UPDATE leads SET data = ?, status = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(data), "kyb_pending", now, req.params.id);

    console.log(`🔐  Lead ${req.params.id} marked as KYB Pending`);
    res.json({ success: true, id: req.params.id, status: "kyb_pending" });
  } catch (err) {
    console.error("Error marking KYB:", err);
    res.status(500).json({ error: "Failed to update KYB status" });
  }
});

module.exports = router;
