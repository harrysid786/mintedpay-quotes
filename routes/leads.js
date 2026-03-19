/**
 * MintedPay — Back Office Leads API
 * Handles CRUD for sales leads plus KYB status transitions.
 *
 * Routes:
 *   GET    /api/leads            — list all leads (excludes archived by default)
 *   POST   /api/leads            — create new lead (draft)
 *   GET    /api/leads/:id        — get single lead
 *   PUT    /api/leads/:id        — update (autosave, tracks activity)
 *   POST   /api/leads/:id/kyb   — mark as kyb_pending (tracks activity)
 *   DELETE /api/leads/:id        — soft delete (archive) or hard delete
 *   POST   /api/leads/:id/notes  — add a note
 *   PUT    /api/leads/:id/assign — assign owner
 *   POST   /api/leads/:id/push-zoho — push lead to Zoho CRM
 *   GET    /api/leads/:id/activity — get activity timeline
 */

const express = require("express");
const router  = express.Router();
const db      = require("../db");
const { createLead } = require("../services/zohoCRM");

// ── Helpers ───────────────────────────────────────────────────
function genLeadId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `LEAD-${ts}-${rand}`;
}

function parseRow(row) {
  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch (_) {}

  let notes = [];
  try { notes = JSON.parse(row.notes || "[]"); } catch (_) {}

  let activity = [];
  try { activity = JSON.parse(row.activity || "[]"); } catch (_) {}

  return {
    id:           row.id,
    status:       row.status     || "draft",
    riskLevel:    row.risk_level || data.riskLevel || "",
    decision:     row.decision   || data.decision   || "",
    zohoPushed:   row.zoho_pushed || 0,
    notes:        notes,
    assignedTo:   row.assigned_to || "",
    activity:     activity,
    brand:        row.brand || "",
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
    // spread lead data fields (contact, volume, pricing, etc.)
    ...data,
    // ensure id/status are not overwritten by stale data blob
    id:           row.id,
    status:       row.status || data.status || "draft",
  };
}

/**
 * Helper function to add an activity entry to a lead
 * @param {string} leadId
 * @param {string} type - activity type (e.g., "lead_created", "status_changed", "note_added")
 * @param {Object} details - optional details object
 */
function addActivity(leadId, type, details = {}) {
  try {
    const row = db.prepare("SELECT activity FROM leads WHERE id = ?").get(leadId);
    if (!row) return;

    let activity = [];
    try { activity = JSON.parse(row.activity || "[]"); } catch (_) {}

    const entry = {
      type,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substring(7),
      ...details,
    };

    activity.push(entry);

    db.prepare("UPDATE leads SET activity = ? WHERE id = ?")
      .run(JSON.stringify(activity), leadId);
  } catch (err) {
    console.error(`Error adding activity for lead ${leadId}:`, err);
  }
}

// ── GET /api/leads — list leads with optional pagination ──────
// Query params: ?limit=50&offset=0  (defaults: limit 50, offset 0)
// Query param: ?includeArchived=true to include archived leads
// Backward-compatible: omitting params returns first 50 as before.
router.get("/", (req, res) => {
  try {
    const limit  = Math.max(1, parseInt(req.query.limit)  || 50);
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const includeArchived = req.query.includeArchived === "true";

    const whereClause = includeArchived ? "" : "WHERE status != 'archived'";

    const rows = db.prepare(`
      SELECT id, data, status, risk_level, decision, created_at, updated_at, zoho_pushed, notes, assigned_to, activity, brand
      FROM leads
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const countQuery = includeArchived
      ? "SELECT COUNT(*) AS n FROM leads"
      : "SELECT COUNT(*) AS n FROM leads WHERE status != 'archived'";

    const total = db.prepare(countQuery).get().n;

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

    // Initialize activity with lead_created entry
    const initialActivity = [
      {
        type: "lead_created",
        timestamp: now,
        id: Math.random().toString(36).substring(7),
      },
    ];

    db.prepare(
      "INSERT INTO leads (id, data, status, risk_level, decision, created_at, updated_at, zoho_pushed, notes, assigned_to, activity, brand) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      id,
      JSON.stringify(payload),
      status,
      payload.riskLevel || "",
      payload.decision  || "",
      now,
      now,
      0,
      JSON.stringify([]),
      "",
      JSON.stringify(initialActivity),
      payload.brand || ""
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
    const oldStatus = row.status || "draft";
    const newStatus = req.body.status || oldStatus;
    const risk    = req.body.riskLevel || updated.riskLevel || row.risk_level || "";
    const decision= req.body.decision || updated.decision  || row.decision    || "";

    db.prepare(
      "UPDATE leads SET data = ?, status = ?, risk_level = ?, decision = ?, updated_at = ? WHERE id = ?"
    ).run(JSON.stringify(updated), newStatus, risk, decision, now, req.params.id);

    // Track activity if status changed
    if (newStatus !== oldStatus) {
      addActivity(req.params.id, "status_changed", {
        oldStatus,
        newStatus,
      });
    }

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

    // Track activity
    addActivity(req.params.id, "kyb_submitted", {});

    console.log(`🔐  Lead ${req.params.id} marked as KYB Pending`);
    res.json({ success: true, id: req.params.id, status: "kyb_pending" });
  } catch (err) {
    console.error("Error marking KYB:", err);
    res.status(500).json({ error: "Failed to update KYB status" });
  }
});

// ── DELETE /api/leads/:id — soft or hard delete ────────────────
router.delete("/:id", (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    const permanent = req.query.permanent === "true";
    const now = new Date().toISOString();

    if (permanent) {
      // Hard delete
      db.prepare("DELETE FROM leads WHERE id = ?").run(req.params.id);
      res.json({ success: true, id: req.params.id, deleted: true });
    } else {
      // Soft delete (archive)
      db.prepare("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?")
        .run("archived", now, req.params.id);

      addActivity(req.params.id, "archived", {});
      res.json({ success: true, id: req.params.id, archived: true });
    }
  } catch (err) {
    console.error("Error deleting lead:", err);
    res.status(500).json({ error: "Failed to delete lead" });
  }
});

// ── POST /api/leads/:id/notes — add a note ─────────────────────
router.post("/:id/notes", (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Note text is required" });

    const row = db.prepare("SELECT notes FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    let notes = [];
    try { notes = JSON.parse(row.notes || "[]"); } catch (_) {}

    const newNote = {
      text,
      timestamp: new Date().toISOString(),
      id: Math.random().toString(36).substring(7),
    };

    notes.push(newNote);

    db.prepare("UPDATE leads SET notes = ? WHERE id = ?")
      .run(JSON.stringify(notes), req.params.id);

    addActivity(req.params.id, "note_added", { noteId: newNote.id });

    res.json({ success: true, notes });
  } catch (err) {
    console.error("Error adding note:", err);
    res.status(500).json({ error: "Failed to add note" });
  }
});

// ── PUT /api/leads/:id/assign — assign owner ───────────────────
router.put("/:id/assign", (req, res) => {
  try {
    const { assignedTo } = req.body;
    if (!assignedTo) return res.status(400).json({ error: "assignedTo is required" });

    const row = db.prepare("SELECT assigned_to FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    const oldAssignedTo = row.assigned_to || "";
    const now = new Date().toISOString();

    db.prepare("UPDATE leads SET assigned_to = ?, updated_at = ? WHERE id = ?")
      .run(assignedTo, now, req.params.id);

    addActivity(req.params.id, "reassigned", {
      oldAssignedTo,
      newAssignedTo: assignedTo,
    });

    res.json({ success: true, id: req.params.id, assignedTo });
  } catch (err) {
    console.error("Error assigning lead:", err);
    res.status(500).json({ error: "Failed to assign lead" });
  }
});

// ── POST /api/leads/:id/push-zoho — push lead to Zoho CRM ──────
router.post("/:id/push-zoho", async (req, res) => {
  try {
    const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    // Prevent duplicate pushes (CRITICAL)
    if (row.zoho_pushed === 1) {
      return res.json({ success: true, message: "Already pushed to Zoho" });
    }

    const lead = parseRow(row);

    // Build the quote URL if a quote_id exists
    const origin = process.env.PUBLIC_URL || (req.protocol + "://" + req.get("host"));
    const quoteUrl = lead.quote_id ? `${origin}/quote.html?quote=${lead.quote_id}` : "";

    // Calculate transaction count from volume + avg
    const vol   = parseFloat(lead.monthlyVolume) || 0;
    const avgTx = parseFloat(lead.avgTransactionValue) || 55;
    const txCnt = avgTx > 0 ? Math.round(vol / avgTx) : 0;

    await createLead({
      merchant_name:     lead.businessName || lead.contactName || "",
      merchant_email:    lead.email || "",
      quote_id:          lead.quote_id || row.id,
      quote_link:        quoteUrl,
      monthly_volume:    vol,
      transaction_count: txCnt,
      current_rate:      lead.currentRate || null,
      quoted_rate:       lead.processingRate || 0,
      quote_source:      "Admin Tool",
    });

    // Mark as pushed in DB
    db.prepare("UPDATE leads SET zoho_pushed = 1 WHERE id = ?").run(req.params.id);

    // Log activity
    addActivity(req.params.id, "zoho_pushed", {});

    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error("Error pushing lead to Zoho:", err);
    res.status(500).json({ error: "Failed to push lead to Zoho CRM" });
  }
});

// ── GET /api/leads/:id/activity — get activity timeline ───────
router.get("/:id/activity", (req, res) => {
  try {
    const row = db.prepare("SELECT activity FROM leads WHERE id = ?").get(req.params.id);
    if (!row) return res.status(404).json({ error: "Lead not found" });

    let activity = [];
    try { activity = JSON.parse(row.activity || "[]"); } catch (_) {}

    res.json(activity);
  } catch (err) {
    console.error("Error fetching activity:", err);
    res.status(500).json({ error: "Failed to fetch activity" });
  }
});

module.exports = router;
