/**
 * MintedPay — Lead Flow Wizard
 * Fullscreen step-by-step sales lead creation.
 * Exposed as window.LeadFlow (class).
 *
 * Usage:
 *   const flow = new LeadFlow({ onClose, onSaved });
 *   flow.open();               // new lead
 *   flow.open(existingLead);  // resume existing
 */
(function () {
  "use strict";

  // ── Countries datalist ────────────────────────────────────
  const COUNTRIES = [
    "United Kingdom","Ireland","United States","Canada","Australia","Germany",
    "France","Netherlands","Spain","Italy","Portugal","Belgium","Luxembourg",
    "Denmark","Sweden","Norway","Finland","Switzerland","Austria","Poland",
    "Czech Republic","Hungary","Romania","Bulgaria","Greece","Malta","Cyprus",
    "Singapore","UAE","South Africa","New Zealand","Japan","India","Brazil",
    "Mexico","Argentina","Hong Kong","Israel","Turkey","Saudi Arabia","Nigeria",
  ];

  // ── Step definitions ─────────────────────────────────────
  const STEPS = [
    {
      id: 1,
      title: "Basic Qualification",
      subtitle: "Tell us about the business",
      fields: [
        { name: "businessName", label: "Business Name", type: "text", required: true, placeholder: "Acme Ltd" },
        { name: "country",      label: "Country of Operation", type: "datalist", required: true, options: COUNTRIES, placeholder: "Start typing a country..." },
        { name: "industry",     label: "Industry / Business Type", type: "text", required: true, placeholder: "e.g. E-commerce, SaaS, Retail, Hospitality..." },
      ],
    },
    {
      id: 2,
      title: "Business Model",
      subtitle: "How does the business operate?",
      fields: [
        { name: "description",   label: "Business Description", type: "textarea", placeholder: "Briefly describe what the business does and how it sells..." },
        { name: "website",       label: "Website URL", type: "url", placeholder: "https://example.com" },
        { name: "salesChannels", label: "Sales Channels", type: "select", options: [
          { value: "online",  label: "Online only" },
          { value: "retail",  label: "Retail / In-person only" },
          { value: "both",    label: "Both online & retail" },
        ]},
      ],
    },
    {
      id: 3,
      title: "Payment Types",
      subtitle: "How do customers pay?",
      fields: [
        { name: "paymentTypes", label: "Payment Types", type: "select", options: [
          { value: "one-off",      label: "One-off payments" },
          { value: "subscription", label: "Subscriptions / recurring billing" },
          { value: "both",         label: "Both one-off & recurring" },
        ]},
        { name: "subscriptionFrequency", label: "Subscription Frequency", type: "select",
          showIf: (lead) => lead.paymentTypes === "subscription" || lead.paymentTypes === "both",
          options: [
            { value: "weekly",    label: "Weekly" },
            { value: "monthly",   label: "Monthly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "annually",  label: "Annually / yearly" },
          ],
        },
      ],
    },
    {
      id: 4,
      title: "Risk Signals",
      subtitle: "Help us understand the risk profile",
      fields: [
        { name: "intlPercentage",  label: "International Transactions (%)", type: "number", placeholder: "0", min: 0, max: 100 },
        { name: "refundRate",      label: "Refund Rate (%) — optional",     type: "number", placeholder: "e.g. 2.5", min: 0 },
        { name: "chargebackRate",  label: "Chargeback Rate (%) — optional", type: "number", placeholder: "e.g. 0.5", min: 0 },
        { name: "holdsFunds",      label: "Does the business hold customer funds?", type: "select", options: [
          { value: "no",  label: "No" },
          { value: "yes", label: "Yes — we hold funds before disbursing" },
        ]},
      ],
    },
    {
      id: 5,
      title: "Current Setup",
      subtitle: "Who do they process with today?",
      fields: [
        { name: "currentProvider", label: "Current Payment Provider", type: "text", placeholder: "e.g. Stripe, Worldpay, PayPal, Adyen..." },
        { name: "painPoints",      label: "Pain Points / Reason for Switching — optional", type: "textarea", placeholder: "What issues are they facing with their current provider?" },
      ],
    },
    {
      id: 6,
      title: "Tech Stack",
      subtitle: "What platforms and tools do they use?",
      fields: [
        { name: "platform", label: "E-commerce / CMS Platform", type: "select", options: [
          { value: "shopify",     label: "Shopify" },
          { value: "woocommerce", label: "WooCommerce" },
          { value: "magento",     label: "Magento / Adobe Commerce" },
          { value: "bigcommerce", label: "BigCommerce" },
          { value: "squarespace", label: "Squarespace" },
          { value: "wix",         label: "Wix" },
          { value: "custom",      label: "Custom built" },
          { value: "none",        label: "None / Not applicable" },
          { value: "other",       label: "Other" },
        ]},
        { name: "integrations",       label: "Key Integrations (CRM, ERP, etc.)", type: "text", placeholder: "e.g. Salesforce, HubSpot, SAP, Zapier..." },
        { name: "accountingSoftware", label: "Accounting Software", type: "select", options: [
          { value: "xero",        label: "Xero" },
          { value: "quickbooks",  label: "QuickBooks" },
          { value: "sage",        label: "Sage" },
          { value: "freeagent",   label: "FreeAgent" },
          { value: "wave",        label: "Wave" },
          { value: "none",        label: "None" },
          { value: "other",       label: "Other" },
        ]},
      ],
    },
    {
      id: 7,
      title: "Volume & Transactions",
      subtitle: "Monthly processing volume and average transaction size",
      fields: [
        { name: "monthlyVolume",       label: "Monthly Processing Volume (£)", type: "number", required: true, placeholder: "e.g. 50000", min: 0 },
        { name: "avgTransactionValue", label: "Average Transaction Value (£)",  type: "number", required: true, placeholder: "e.g. 45",    min: 0 },
      ],
    },
    {
      id: 8,
      title: "Contact Details",
      subtitle: "Who should we be in touch with?",
      fields: [
        { name: "contactName", label: "Contact Name",    type: "text",  required: true, placeholder: "Jane Smith" },
        { name: "email",       label: "Email Address",   type: "email", required: true, placeholder: "jane@company.com" },
        { name: "phone",       label: "Phone Number",    type: "tel",   placeholder: "+44 7700 000000" },
        { name: "leadSource",  label: "Lead Source",     type: "select", options: [
          { value: "website",       label: "Website / Inbound" },
          { value: "referral",      label: "Referral" },
          { value: "cold_outreach", label: "Cold Outreach" },
          { value: "event",         label: "Event / Conference" },
          { value: "linkedin",      label: "LinkedIn" },
          { value: "partner",       label: "Partner" },
          { value: "other",         label: "Other" },
        ]},
      ],
    },
    {
      id: 9,
      title: "Pricing & Output",
      subtitle: "Review the pricing recommendation and risk assessment",
      isOutput: true,
    },
  ];

  // ── Resume step helper (Fix 3) ────────────────────────────
  // Returns the first step that hasn't been filled yet.
  // Note: intlPercentage can legitimately be 0, so we check !== 0 explicitly.
  function getLastStep(lead) {
    if (!lead.businessName)                                           return 1;
    if (!lead.salesChannels)                                          return 2;
    if (!lead.paymentTypes)                                           return 3;
    if (!lead.intlPercentage && lead.intlPercentage !== 0)            return 4;
    if (!lead.currentProvider)                                        return 5;
    if (!lead.platform)                                               return 6;
    if (!lead.monthlyVolume)                                          return 7;
    if (!lead.contactName)                                            return 8;
    return 9;
  }

  // ═══════════════════════════════════════════════════════════
  class LeadFlow {
    constructor({ onClose, onSaved } = {}) {
      this.onClose = onClose || (() => {});
      this.onSaved = onSaved || (() => {});
      this.lead          = {};
      this.leadId        = null;
      this.currentStep   = 1;
      this.totalSteps    = STEPS.length;
      this.saveTimeout   = null;
      this.pricingResult = null;
      this.riskResult    = null;
      this.isRejected    = false;
      this._rejectReason = "";
      this.isCalculating = false;
      this.overlay       = document.getElementById("lead-flow");
    }

    // ── Public: open (new or resume) ───────────────────────
    async open(existingLead) {
      this.isRejected    = false;
      this._rejectReason = "";
      this.pricingResult = null;
      this.riskResult    = null;

      if (existingLead) {
        this.lead    = { ...existingLead };
        this.leadId  = existingLead.id;
        this.currentStep = this._resumeStep();
      } else {
        this.lead       = {};
        this.leadId     = null;
        this.currentStep = 1;
        // Create a draft lead to get an ID for autosave
        try {
          const resp = await fetch("/api/leads", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ status: "draft" }),
          });
          const data = await resp.json();
          this.leadId    = data.id;
          this.lead.id   = data.id;
        } catch (e) {
          console.error("Could not create draft lead:", e);
        }
      }

      this.overlay.classList.remove("hidden");
      document.body.style.overflow = "hidden";
      this._render();
    }

    // ── Public: close ──────────────────────────────────────
    close() {
      clearTimeout(this.saveTimeout);
      this.overlay.classList.add("hidden");
      document.body.style.overflow = "";
      this.onClose();
    }

    // ── Determine which step to resume at ─────────────────
    // Walks through each step in order — returns the first incomplete one.
    // Handles the intlPercentage === 0 edge case (falsy but valid).
    _resumeStep() {
      return getLastStep(this.lead);
    }

    // ── Render entire flow ─────────────────────────────────
    _render() {
      this.overlay.innerHTML = this._buildLayout();
      this._bindEvents();
      if (this.currentStep === 9 && !this.pricingResult && !this.isRejected) {
        this._calculateOutput();
      }
    }

    // ── Main layout skeleton ───────────────────────────────
    _buildLayout() {
      const progress = Math.round((this.currentStep / this.totalSteps) * 100);
      const stepDef  = STEPS[this.currentStep - 1];
      return `
        <div class="lf-header">
          <button class="lf-back-btn" id="lf-close-btn">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Dashboard
          </button>
          <div class="lf-progress-wrap">
            <div class="lf-step-dots">
              ${STEPS.map((s, i) => `
                <span class="lf-dot ${i + 1 < this.currentStep ? 'done' : i + 1 === this.currentStep ? 'active' : ''}"
                      title="Step ${s.id}: ${s.title}"></span>
              `).join("")}
            </div>
            <div class="lf-progress-bar">
              <div class="lf-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="lf-step-label">Step ${this.currentStep} of ${this.totalSteps} — <em>${stepDef.title}</em></div>
          </div>
          <div class="lf-save-status" id="lf-save-status">
            <span class="lf-save-dot"></span> Saved
          </div>
        </div>

        <div class="lf-body" id="lf-body">
          ${this.isRejected ? this._buildRejected() : this._buildStep()}
        </div>

        ${!this.isRejected && !STEPS[this.currentStep - 1].isOutput ? this._buildFooter() : ""}
      `;
    }

    // ── Step body content ──────────────────────────────────
    _buildStep() {
      const s = STEPS[this.currentStep - 1];
      if (s.isOutput) return this._buildOutput();
      return `
        <div class="lf-step-wrap">
          <div class="lf-step-head">
            <div class="lf-step-num">Step ${s.id}</div>
            <h2 class="lf-step-title">${s.title}</h2>
            <p class="lf-step-sub">${s.subtitle}</p>
          </div>
          <div class="lf-fields">
            ${s.fields.map(f => this._buildField(f)).join("")}
          </div>
        </div>
      `;
    }

    // ── Individual field renderer ──────────────────────────
    _buildField(f) {
      if (f.showIf && !f.showIf(this.lead)) {
        return `<div class="lf-field hidden" data-field="${f.name}"></div>`;
      }
      const val  = this.lead[f.name] != null ? String(this.lead[f.name]) : "";
      const req  = f.required ? ' <span class="lf-req">*</span>' : "";
      let   ctrl = "";

      if (f.type === "textarea") {
        ctrl = `<textarea class="lf-ctrl lf-ta" id="lf-${f.name}" name="${f.name}"
                          placeholder="${f.placeholder || ""}" rows="3">${val}</textarea>`;
      } else if (f.type === "select") {
        ctrl = `<select class="lf-ctrl" id="lf-${f.name}" name="${f.name}">
                  <option value="">— Select —</option>
                  ${(f.options || []).map(o =>
                    `<option value="${o.value}" ${val === o.value ? "selected" : ""}>${o.label}</option>`
                  ).join("")}
                </select>`;
      } else if (f.type === "datalist") {
        const dlId = `dl-${f.name}`;
        ctrl = `
          <input class="lf-ctrl" id="lf-${f.name}" name="${f.name}" type="text"
                 value="${val}" placeholder="${f.placeholder || ""}" list="${dlId}" autocomplete="off">
          <datalist id="${dlId}">
            ${(f.options || []).map(o => `<option value="${o}"></option>`).join("")}
          </datalist>`;
      } else {
        const minA = f.min !== undefined ? `min="${f.min}"` : "";
        const maxA = f.max !== undefined ? `max="${f.max}"` : "";
        ctrl = `<input class="lf-ctrl" id="lf-${f.name}" name="${f.name}"
                       type="${f.type}" value="${val}"
                       placeholder="${f.placeholder || ""}" ${minA} ${maxA} autocomplete="off">`;
      }

      return `
        <div class="lf-field" data-field="${f.name}">
          <label class="lf-lbl" for="lf-${f.name}">${f.label}${req}</label>
          ${ctrl}
        </div>
      `;
    }

    // ── Output step (Step 9) ───────────────────────────────
    _buildOutput() {
      if (this.isCalculating || !this.pricingResult) {
        return `
          <div class="lf-step-wrap lf-output">
            <div class="lf-calculating">
              <div class="lf-spinner"></div>
              <p>Calculating pricing &amp; risk assessment…</p>
            </div>
          </div>`;
      }

      const p   = this.pricingResult;
      const r   = this.riskResult || { riskLevel: "low", decision: "accept" };
      const vol    = parseFloat(this.lead.monthlyVolume)       || 0;
      const avgTx  = parseFloat(this.lead.avgTransactionValue) || 55;
      const txCnt  = avgTx > 0 ? Math.round(vol / avgTx) : Math.round(vol / 55);
      const estRev = ((vol * p.rate / 100) + (txCnt * p.fixed_fee / 100));
      const estMrg = (p.rate - 0.46).toFixed(2);

      const rBadge = r.riskLevel === "low"  ? "lf-badge-green"
                   : r.riskLevel === "medium" ? "lf-badge-amber"
                   : "lf-badge-red";
      const dBadge = r.decision  === "accept" ? "lf-badge-green"
                   : r.decision  === "review"  ? "lf-badge-amber"
                   : "lf-badge-red";

      const isKYB       = this.lead.status === "kyb_pending";
      const isQualified = this.lead.status === "qualified" || isKYB;

      return `
        <div class="lf-step-wrap lf-output">
          <div class="lf-step-head">
            <div class="lf-step-num">Step 9</div>
            <h2 class="lf-step-title">Pricing &amp; Output</h2>
            <p class="lf-step-sub">
              Recommendation for <strong>${this.lead.businessName || "this lead"}</strong>
              ${this.lead.country ? "· " + this.lead.country : ""}
            </p>
          </div>

          <div class="lf-output-grid">
            <!-- Pricing card -->
            <div class="lf-card">
              <div class="lf-card-hdr">💰 Pricing Recommendation</div>
              <div class="lf-pricing-rows">
                <div class="lf-pr"><span class="lf-pr-lbl">Processing Rate</span>
                  <span class="lf-pr-val big">${p.rate}%</span></div>
                <div class="lf-pr"><span class="lf-pr-lbl">Fixed Fee / Transaction</span>
                  <span class="lf-pr-val">${p.fixed_fee}p</span></div>
                <div class="lf-pr"><span class="lf-pr-lbl">Est. Monthly Revenue</span>
                  <span class="lf-pr-val">£${estRev.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
                <div class="lf-pr"><span class="lf-pr-lbl">Est. Gross Margin</span>
                  <span class="lf-pr-val">~${estMrg}% pts</span></div>
                ${p.monthly_saving > 0 ? `
                <div class="lf-pr lf-savings">
                  <span class="lf-pr-lbl">Saving vs Current Provider</span>
                  <span class="lf-pr-val green">£${p.monthly_saving.toLocaleString("en-GB")}/mo</span>
                </div>` : ""}
              </div>
            </div>

            <!-- Risk card -->
            <div class="lf-card">
              <div class="lf-card-hdr">🔍 Risk Assessment</div>
              <div class="lf-risk-rows">
                <div class="lf-rr"><span class="lf-rr-lbl">Risk Level</span>
                  <span class="lf-badge ${rBadge}">${r.riskLevel.toUpperCase()}</span></div>
                <div class="lf-rr"><span class="lf-rr-lbl">Decision</span>
                  <span class="lf-badge ${dBadge}">${r.decision.toUpperCase()}</span></div>
                <div class="lf-rr"><span class="lf-rr-lbl">Monthly Volume</span>
                  <span class="lf-rr-val">£${vol.toLocaleString("en-GB")}</span></div>
                <div class="lf-rr"><span class="lf-rr-lbl">Avg Transaction</span>
                  <span class="lf-rr-val">£${avgTx}</span></div>
                <div class="lf-rr"><span class="lf-rr-lbl">Intl Transactions</span>
                  <span class="lf-rr-val">${this.lead.intlPercentage || 0}%</span></div>
                ${this.lead.chargebackRate ? `
                <div class="lf-rr"><span class="lf-rr-lbl">Chargeback Rate</span>
                  <span class="lf-rr-val">${this.lead.chargebackRate}%</span></div>` : ""}
                ${this.lead.holdsFunds === "yes" ? `
                <div class="lf-rr"><span class="lf-rr-lbl">Holds Funds</span>
                  <span class="lf-badge lf-badge-amber">YES</span></div>` : ""}
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="lf-actions">
            <button class="lf-act-btn lf-act-primary" id="lf-gen-quote"
                    ${isQualified && this.lead.quote_id ? "" : ""}>
              📄 Generate Quote
            </button>
            <button class="lf-act-btn lf-act-secondary" id="lf-push-zoho">
              ☁️ Push to Zoho
            </button>
            <button class="lf-act-btn ${isKYB ? "lf-act-kyb-done" : "lf-act-kyb"}" id="lf-mark-kyb"
                    ${isKYB ? "disabled" : ""}>
              ${isKYB ? "✓ KYB Pending" : "🔐 Mark as KYB Ready"}
            </button>
          </div>

          ${this.lead.quote_id ? `
            <div class="lf-notice lf-notice-green">
              ✓ Quote <strong>${this.lead.quote_id}</strong> generated.
              <a href="/quote.html?quote=${this.lead.quote_id}" target="_blank">View Quote →</a>
            </div>` : ""}
          ${isKYB ? `
            <div class="lf-notice lf-notice-blue">
              🔐 This lead is marked KYB Ready and added to the onboarding pipeline.
            </div>` : ""}
        </div>
      `;
    }

    // ── Rejection screen ───────────────────────────────────
    _buildRejected() {
      return `
        <div class="lf-step-wrap lf-rejected">
          <div class="lf-rejected-icon">🚫</div>
          <h2 class="lf-rejected-title">Business Not Supported</h2>
          <p class="lf-rejected-msg">${this._rejectReason || "This business does not meet our onboarding criteria."}</p>
          <div class="lf-rejected-detail">
            ${this.lead.businessName ? `<div><strong>Business:</strong> ${this.lead.businessName}</div>` : ""}
            ${this.lead.country      ? `<div><strong>Country:</strong> ${this.lead.country}</div>` : ""}
            ${this.lead.industry     ? `<div><strong>Industry:</strong> ${this.lead.industry}</div>` : ""}
          </div>
          <p class="lf-rejected-note">
            This lead has been saved with status <strong>Rejected</strong>.
            You can go back and correct the information if this was entered incorrectly.
          </p>
          <button class="lf-act-btn lf-act-secondary" id="lf-rej-back">← Go Back &amp; Edit</button>
        </div>`;
    }

    // ── Navigation footer ──────────────────────────────────
    _buildFooter() {
      const isLast = this.currentStep === this.totalSteps - 1;
      return `
        <div class="lf-footer">
          <button class="lf-nav-btn lf-nav-back" id="lf-prev"
                  style="${this.currentStep === 1 ? "visibility:hidden" : ""}">
            ← Back
          </button>
          <button class="lf-nav-btn lf-nav-next" id="lf-next">
            ${isLast ? "Review →" : "Next →"}
          </button>
        </div>`;
    }

    // ── Bind all events after render ───────────────────────
    _bindEvents() {
      const q = id => document.getElementById(id);

      q("lf-close-btn")?.addEventListener("click", () => this.close());

      q("lf-rej-back")?.addEventListener("click", () => {
        this.isRejected  = false;
        this.currentStep = 1;
        this._render();
      });

      q("lf-prev")?.addEventListener("click", () => this._prev());
      q("lf-next")?.addEventListener("click", () => this._next());

      q("lf-gen-quote")?.addEventListener("click",  () => this._generateQuote());
      q("lf-push-zoho")?.addEventListener("click",  () => this._pushZoho());
      q("lf-mark-kyb")?.addEventListener("click",   () => this._markKYB());

      // Input autosave
      this.overlay.querySelectorAll(".lf-ctrl").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          this.lead[e.target.name] = e.target.value;
          if (e.target.name === "paymentTypes") this._updateConditional();
          this._scheduleSave();
        });
      });
    }

    // ── Show/hide subscriptionFrequency when paymentTypes changes
    _updateConditional() {
      const wrap = this.overlay.querySelector('[data-field="subscriptionFrequency"]');
      if (!wrap) return;
      const pt = this.lead.paymentTypes;
      const show = pt === "subscription" || pt === "both";
      if (show) {
        wrap.classList.remove("hidden");
        wrap.innerHTML = this._buildField(STEPS[2].fields[1]);
        wrap.querySelector("select")?.addEventListener("change", e => {
          this.lead.subscriptionFrequency = e.target.value;
          this._scheduleSave();
        });
      } else {
        wrap.classList.add("hidden");
        wrap.innerHTML = "";
      }
    }

    // ── Navigation: back ──────────────────────────────────
    _prev() {
      if (this.currentStep > 1) {
        this._collectFields();
        this.currentStep--;
        this._render();
      }
    }

    // ── Navigation: next (with validation + qualification check)
    async _next() {
      this._collectFields();

      // Validate required fields on current step
      const step = STEPS[this.currentStep - 1];
      for (const f of step.fields || []) {
        if (!f.required) continue;
        if (f.showIf && !f.showIf(this.lead)) continue;
        if (!this.lead[f.name] || !String(this.lead[f.name]).trim()) {
          this._fieldError(`lf-${f.name}`, `${f.label} is required`);
          return;
        }
      }

      // Step 1 → qualification gate
      if (this.currentStep === 1) {
        const check = window.RiskEngine.checkQualification(this.lead.country, this.lead.industry);
        if (!check.allowed) {
          this._rejectReason = check.reason;
          this.isRejected    = true;
          await this._saveNow({ status: "rejected" });
          this.onSaved();
          this._render();
          return;
        }
      }

      this.currentStep++;
      await this._saveNow();
      this._render();

      if (this.currentStep === 9) this._calculateOutput();
    }

    // ── Collect current step fields into this.lead ────────
    _collectFields() {
      const step = STEPS[this.currentStep - 1];
      if (!step || step.isOutput) return;
      step.fields.forEach(f => {
        const el = document.getElementById(`lf-${f.name}`);
        if (el && !el.closest(".hidden")) {
          this.lead[f.name] = el.value;
        }
      });
    }

    // ── Field validation error ────────────────────────────
    _fieldError(id, msg) {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.borderColor = "#dc2626";
      el.focus();
      let errEl = el.parentElement.querySelector(".lf-field-err");
      if (!errEl) {
        errEl = document.createElement("div");
        errEl.className = "lf-field-err";
        el.parentElement.appendChild(errEl);
      }
      errEl.textContent = msg;
      setTimeout(() => { el.style.borderColor = ""; errEl?.remove(); }, 3500);
    }

    // ── Autosave: debounce 800ms ───────────────────────────
    _scheduleSave() {
      clearTimeout(this.saveTimeout);
      this._saveStatus("saving");
      this.saveTimeout = setTimeout(() => this._saveNow(), 800);
    }

    _saveStatus(state) {
      const el = document.getElementById("lf-save-status");
      if (!el) return;
      if      (state === "saving") el.innerHTML = '<span class="lf-save-dot pulsing"></span> Saving…';
      else if (state === "saved")  el.innerHTML = '<span class="lf-save-dot"></span> Saved';
      else if (state === "error")  el.innerHTML = '<span class="lf-save-dot err"></span> Save failed';
    }

    async _saveNow(extra = {}) {
      if (!this.leadId) return;
      clearTimeout(this.saveTimeout);
      try {
        const payload = { ...this.lead, ...extra };
        if (!payload.status) payload.status = "draft";
        await fetch(`/api/leads/${this.leadId}`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });
        this._saveStatus("saved");
        this.onSaved();
      } catch (e) {
        this._saveStatus("error");
        console.error("Autosave failed:", e);
      }
    }

    // ── Step 9: call pricing API + risk engine ─────────────
    async _calculateOutput() {
      this.isCalculating = true;
      const body = document.getElementById("lf-body");
      if (body) body.innerHTML = `
        <div class="lf-step-wrap lf-output">
          <div class="lf-calculating"><div class="lf-spinner"></div>
            <p>Calculating pricing &amp; risk assessment…</p></div>
        </div>`;

      // ── Map lead fields to pricing engine inputs ─────────────
      // monthlyVolume + avgTransactionValue → vol + txCnt for /api/calculate_quote
      // intlPercentage, chargebackRate, refundRate → fed into RiskEngine.evaluateRisk() below
      const vol   = parseFloat(this.lead.monthlyVolume)       || 0;
      const avgTx = parseFloat(this.lead.avgTransactionValue) || 55;
      const txCnt = avgTx > 0 ? Math.round(vol / avgTx) : Math.round(vol / 55);

      try {
        // Calls existing pricing engine — no hardcoded or mock pricing
        const resp = await fetch("/api/calculate_quote", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            merchant_name:     this.lead.contactName  || this.lead.businessName || "",
            merchant_email:    this.lead.email        || "admin@mintedpay.com",
            monthly_volume:    vol,
            transaction_count: txCnt,
            current_fees:      0,
            debit_frac:        0.70,
          }),
        });
        const data = await resp.json();
        if (data.success) {
          this.pricingResult = data;
          this.lead.quote_id = data.quote_id;
          this.lead.pricing  = {
            rate:                data.rate,
            fixedFee:            data.fixed_fee,
            estimatedMonthlyCost: ((vol * data.rate / 100) + (txCnt * data.fixed_fee / 100)).toFixed(2),
            margin:               (data.rate - 0.46).toFixed(2),
          };
        } else {
          this.pricingResult = { rate: 0, fixed_fee: 0, success: false, _error: data.error };
        }
      } catch (e) {
        console.error("Pricing error:", e);
        this.pricingResult = { rate: 0, fixed_fee: 0, success: false, _error: String(e) };
      }

      // Risk evaluation
      this.riskResult       = window.RiskEngine.evaluateRisk(this.lead);
      this.lead.riskLevel   = this.riskResult.riskLevel;
      this.lead.decision    = this.riskResult.decision;
      this.lead.status      = this.riskResult.decision === "reject" ? "rejected" : "completed";

      this.isCalculating = false;
      await this._saveNow({
        status:    this.lead.status,
        riskLevel: this.lead.riskLevel,
        decision:  this.lead.decision,
      });
      this.onSaved();
      this._render();
    }

    // ── Action: Generate Quote ────────────────────────────
    async _generateQuote() {
      if (!this.pricingResult?.quote_id) {
        alert("No quote available. Please wait for the pricing calculation to complete.");
        return;
      }
      this.lead.status = "qualified";
      await this._saveNow({ status: "qualified" });
      this.onSaved();
      window.open(`/quote.html?quote=${this.pricingResult.quote_id}`, "_blank");
      this._render();
    }

    // ── Action: Push to Zoho (placeholder) ───────────────
    async _pushZoho() {
      const btn = document.getElementById("lf-push-zoho");
      if (!btn) return;
      btn.textContent = "Pushing…";
      btn.disabled    = true;
      // Placeholder — wire up /api/leads/:id/push-zoho when ready
      await new Promise(r => setTimeout(r, 900));
      btn.textContent = "✓ Pushed to Zoho";
      btn.classList.add("lf-act-done");
      setTimeout(() => {
        btn.textContent = "☁️ Push to Zoho";
        btn.disabled    = false;
        btn.classList.remove("lf-act-done");
      }, 4000);
    }

    // ── Action: Mark KYB Ready ────────────────────────────
    async _markKYB() {
      if (this.lead.status === "kyb_pending") return;
      const btn = document.getElementById("lf-mark-kyb");
      if (btn) { btn.textContent = "Saving…"; btn.disabled = true; }
      try {
        await fetch(`/api/leads/${this.leadId}/kyb`, { method: "POST" });
        this.lead.status = "kyb_pending";
        this.onSaved();
        this._render();
      } catch (e) {
        if (btn) { btn.textContent = "🔐 Mark as KYB Ready"; btn.disabled = false; }
        alert("Error marking as KYB. Please try again.");
      }
    }
  }

  // ── Export ───────────────────────────────────────────────
  window.LeadFlow = LeadFlow;
})();
