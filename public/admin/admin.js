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

  // ── Public: delete lead ────────────────────────────────────
  window.adminDeleteLead = async function (id) {
    const confirmDelete = confirm("Archive this lead? Click OK to archive, or Cancel to dismiss.");
    if (!confirmDelete) return;

    const permanent = confirm("Permanently delete? Click OK to permanently delete, or Cancel to just archive.");

    try {
      const url = permanent ? `/api/leads/${id}?permanent=true` : `/api/leads/${id}`;
      const resp = await fetch(url, { method: "DELETE" });

      if (!resp.ok) {
        alert("Error deleting lead. Please try again.");
        return;
      }

      loadLeads();
    } catch (e) {
      alert("Could not delete lead. Please try again.");
      console.error("Error deleting lead:", e);
    }
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
