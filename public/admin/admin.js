/**
 * MintedPay — Admin Dashboard Logic
 * Manages the leads table, stats, and wires up the LeadFlow wizard.
 */
(function () {
  "use strict";

  let flow = null;

  // ── Formatting helpers ───────────────────────────────────
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtVolume(v) {
    if (!v && v !== 0) return "—";
    const n = parseFloat(v);
    if (!n) return "—";
    if (n >= 1_000_000) return "£" + (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return "£" + (n / 1_000).toFixed(0) + "k";
    return "£" + n.toLocaleString("en-GB");
  }

  function statusBadge(status) {
    const cfg = {
      new:         { cls: "bd-grey",   lbl: "New"         },
      draft:       { cls: "bd-grey",   lbl: "Draft"       },
      qualified:   { cls: "bd-green",  lbl: "Qualified"   },
      quoted:      { cls: "bd-blue",   lbl: "Quoted"      },
      kyb_pending: { cls: "bd-purple", lbl: "KYB Pending" },
      live:        { cls: "bd-green",  lbl: "✓ Live"      },
      rejected:    { cls: "bd-red",    lbl: "Rejected"    },
      archived:    { cls: "bd-grey",   lbl: "Archived"    },
    };
    const c = cfg[status] || { cls: "bd-grey", lbl: status || "—" };
    return `<span class="db-badge ${c.cls}">${c.lbl}</span>`;
  }

  function riskBadge(level) {
    if (!level) return `<span class="db-badge bd-grey">—</span>`;
    const cls = level === "low" ? "bd-green" : level === "medium" ? "bd-amber" : "bd-red";
    return `<span class="db-badge ${cls}">${level.charAt(0).toUpperCase() + level.slice(1)}</span>`;
  }

  function brandBadge(brand) {
    if (!brand || brand === "minted") return "";
    return `<span class="db-brand-badge">${brand.charAt(0).toUpperCase() + brand.slice(1)}</span>`;
  }

  // ── Load & render leads table ────────────────────────────
  async function loadLeads() {
    const tbody = document.getElementById("leads-tbody");
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="10" class="tbl-info">Loading…</td></tr>`;

    try {
      const resp = await fetch("/api/leads");
      const json = await resp.json();
      // Handle both paginated response { leads, total } and legacy plain array
      const leads = Array.isArray(json) ? json : (json.leads || []);

      updateStats(leads);

      if (!leads.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="10" class="tbl-empty">
              No leads yet.<br>
              <button class="tbl-new-btn" onclick="window.adminNewLead()">+ Create your first lead</button>
            </td>
          </tr>`;
        return;
      }

      tbody.innerHTML = leads.map(lead => `
        <tr class="db-row" data-id="${lead.id}">
          <td class="td-biz">
            <div class="td-biz-name">
              ${lead.businessName || "<em class='muted'>Untitled</em>"}
              ${brandBadge(lead.brand)}
            </div>
            <div class="td-biz-sub">${lead.industry || ""}</div>
          </td>
          <td class="td-country">${lead.country || "—"}</td>
          <td class="td-volume">${fmtVolume(lead.monthlyVolume)}</td>
          <td>${statusBadge(lead.status)}</td>
          <td>${riskBadge(lead.riskLevel)}</td>
          <td class="td-contact">
            <div>${lead.contactName || "—"}</div>
            ${lead.email ? `<div class="td-email">${lead.email}</div>` : ""}
          </td>
          <td class="td-assignee">${lead.assignedTo || "—"}</td>
          <td class="td-date">${fmtDate(lead.createdAt)}</td>
          <td class="td-act">
            <button class="db-open-btn" onclick="window.adminOpenLead('${lead.id}')">Open →</button>
            <button class="db-delete-btn" onclick="window.adminDeleteLead('${lead.id}')" title="Delete lead">🗑</button>
          </td>
        </tr>
      `).join("");

    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="10" class="tbl-error">⚠️ Could not load leads. Is the server running?</td></tr>`;
      console.error("Error loading leads:", e);
    }
  }

  // ── Update stats cards ────────────────────────────────────
  function updateStats(leads) {
    if (!Array.isArray(leads)) return;
    const total     = leads.length;
    const active    = leads.filter(l => l.status === "qualified" || l.status === "kyb_pending" || l.status === "live").length;
    const draft     = leads.filter(l => l.status === "draft" || l.status === "new").length;
    const quoted    = leads.filter(l => l.status === "quoted").length;
    const rejected  = leads.filter(l => l.status === "rejected").length;
    const archived  = leads.filter(l => l.status === "archived").length;
    const totalVol  = leads.reduce((s, l) => s + (parseFloat(l.monthlyVolume) || 0), 0);

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("stat-total",    total);
    set("stat-active",   active);
    set("stat-draft",    draft);
    set("stat-quoted",   quoted);
    set("stat-rejected", rejected);
    set("stat-archived", archived);
    set("stat-vol",      fmtVolume(totalVol));
  }

  // ── Search / filter ────────────────────────────────────
  function initSearch() {
    const input = document.getElementById("leads-search");
    if (!input) return;
    input.addEventListener("input", () => {
      const q = input.value.toLowerCase().trim();
      document.querySelectorAll(".db-row").forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = (!q || text.includes(q)) ? "" : "none";
      });
    });
  }

  // ── Status filter ─────────────────────────────────────
  function initStatusFilter() {
    const sel = document.getElementById("leads-filter");
    if (!sel) return;
    sel.addEventListener("change", () => {
      const val = sel.value;
      document.querySelectorAll(".db-row").forEach(row => {
        if (!val) { row.style.display = ""; return; }
        const badge = row.querySelector(".db-badge");
        const status = badge ? badge.textContent.toLowerCase().replace(/ /g, "_").replace("✓_live", "live") : "";
        row.style.display = status.includes(val) ? "" : "none";
      });
    });
  }

  // ── Public: open lead flow for new lead ───────────────────
  window.adminNewLead = function () {
    if (!flow) return;
    flow.open();
  };

  // ── Public: open lead flow for existing lead ──────────────
  window.adminOpenLead = async function (id) {
    try {
      const resp = await fetch(`/api/leads/${id}`);
      const lead = await resp.json();
      if (!flow) return;
      flow.open(lead);
    } catch (e) {
      alert("Could not load lead. Please try again.");
    }
  };

  // ── Delete confirmation modal ─────────────────────────────
  function showDeleteModal(id) {
    const existing = document.getElementById("mp-delete-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "mp-delete-modal";
    overlay.style.cssText = [
      "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);",
      "display:flex;align-items:center;justify-content:center;"
    ].join("");

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:28px 32px;max-width:420px;width:90%;
                  box-shadow:0 20px 60px rgba(0,0,0,.2);font-family:'Inter',sans-serif;">
        <div style="font-size:32px;text-align:center;margin-bottom:12px;">🗑️</div>
        <h3 style="font-size:16px;font-weight:700;color:#0a0a0a;margin-bottom:8px;text-align:center;">
          Remove this lead?
        </h3>
        <p style="font-size:13px;color:#6b6b6b;text-align:center;margin-bottom:20px;line-height:1.5;">
          Choose how to remove it.<br>
          <strong style="color:#dc2626">Permanent deletion cannot be undone.</strong>
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="del-archive" style="padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;
                  cursor:pointer;border:1px solid #d4d4d4;background:#f5f5f5;color:#1a1a1a;">
            📦 Archive — hide from list, keep data
          </button>
          <button id="del-permanent" style="padding:10px 16px;border-radius:6px;font-size:13px;font-weight:600;
                  cursor:pointer;border:1px solid #fca5a5;background:#fff0f0;color:#dc2626;">
            🗑 Permanently delete — removes all data
          </button>
          <button id="del-cancel" style="padding:9px 16px;border-radius:6px;font-size:12px;font-weight:600;
                  cursor:pointer;border:none;background:none;color:#6b6b6b;">
            Cancel
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    document.getElementById("del-cancel").addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    document.getElementById("del-archive").addEventListener("click", async () => {
      close();
      await _performDelete(id, false);
    });

    document.getElementById("del-permanent").addEventListener("click", () => {
      close();
      // Second-stage confirmation for destructive action
      const conf = document.createElement("div");
      conf.id = "mp-delete-modal";
      conf.style.cssText = [
        "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.55);",
        "display:flex;align-items:center;justify-content:center;"
      ].join("");
      conf.innerHTML = `
        <div style="background:#fff;border-radius:10px;padding:28px 32px;max-width:400px;width:90%;
                    box-shadow:0 20px 60px rgba(0,0,0,.2);font-family:'Inter',sans-serif;
                    border:2px solid #fca5a5;">
          <div style="font-size:32px;text-align:center;margin-bottom:12px;">⚠️</div>
          <h3 style="font-size:16px;font-weight:700;color:#dc2626;margin-bottom:8px;text-align:center;">
            Permanently delete this lead?
          </h3>
          <p style="font-size:13px;color:#6b6b6b;text-align:center;margin-bottom:20px;line-height:1.5;">
            All data for this lead will be <strong>permanently removed</strong> from the database.
            This <strong>cannot be reversed</strong>.
          </p>
          <div style="display:flex;gap:10px;">
            <button id="del-perm-cancel" style="flex:1;padding:10px;border-radius:6px;font-size:13px;
                    font-weight:600;cursor:pointer;border:1px solid #d4d4d4;background:#f5f5f5;color:#1a1a1a;">
              Cancel
            </button>
            <button id="del-perm-confirm" style="flex:1;padding:10px;border-radius:6px;font-size:13px;
                    font-weight:600;cursor:pointer;border:none;background:#dc2626;color:#fff;">
              Yes, Delete Permanently
            </button>
          </div>
        </div>`;
      document.body.appendChild(conf);
      document.getElementById("del-perm-cancel").addEventListener("click", () => conf.remove());
      document.getElementById("del-perm-confirm").addEventListener("click", async () => {
        conf.remove();
        await _performDelete(id, true);
      });
    });
  }

  async function _performDelete(id, permanent) {
    try {
      const url = permanent ? `/api/leads/${id}?permanent=true` : `/api/leads/${id}`;
      const resp = await fetch(url, { method: "DELETE" });
      if (!resp.ok) { alert("Error deleting lead. Please try again."); return; }
      loadLeads();
    } catch (e) {
      alert("Could not delete lead. Please try again.");
      console.error("Error deleting lead:", e);
    }
  }

  // ── Public: delete lead ────────────────────────────────────
  window.adminDeleteLead = function (id) {
    showDeleteModal(id);
  };

  // ── Init on DOM ready ─────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    // Init lead flow wizard
    flow = new window.LeadFlow({
      onClose: () => loadLeads(),
      onSaved: () => {},
    });

    // Load data
    loadLeads();
    initSearch();
    initStatusFilter();

    // Button bindings
    document.getElementById("btn-new-lead")?.addEventListener("click", () => window.adminNewLead());
    document.getElementById("btn-refresh")?.addEventListener("click",  () => loadLeads());
  });
})();
