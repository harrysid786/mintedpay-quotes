/**
 * MintedPay — Lead Flow Wizard
 * Fullscreen step-by-step sales lead creation with Lead Overview.
 * Exposed as window.LeadFlow (class).
 *
 * Usage:
 *   const flow = new LeadFlow({ onClose, onSaved });
 *   flow.open();               // new lead
 *   flow.open(existingLead);  // resume existing or show overview
 */
(function () {
  "use strict";

  // ── Comprehensive Countries List (~195 countries) ────────────
  const COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda",
    "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain",
    "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan",
    "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
    "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada", "Cape Verde",
    "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
    "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic",
    "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor", "Ecuador",
    "Egypt", "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Ethiopia",
    "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", "Germany", "Ghana",
    "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti",
    "Honduras", "Hong Kong", "Hungary", "Iceland", "India", "Indonesia", "Iran",
    "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan",
    "Kenya", "Kiribati", "Kosovo", "Kuwait", "Kyrgyzstan", "Laos", "Latvia",
    "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania",
    "Luxembourg", "Macao", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali",
    "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico", "Micronesia",
    "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar",
    "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger",
    "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan",
    "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru",
    "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
    "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
    "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal",
    "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia",
    "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan",
    "Spain", "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria",
    "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Togo", "Tonga",
    "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
    "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
    "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen",
    "Zambia", "Zimbabwe",
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
        { name: "industry",     label: "Industry / Business Type", type: "select", required: true, options: window.RiskEngine?.INDUSTRY_CATEGORIES || [], placeholder: "Select an industry..." },
        { name: "industryDetail", label: "Industry Details (optional)", type: "text", placeholder: "e.g. B2B SaaS, Fashion E-commerce, Medical Devices..." },
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
        { name: "intlPercentage",  label: "International Transactions (%)", type: "number", required: true, placeholder: "0", min: 0, max: 100 },
        { name: "refundRate",      label: "Refund Rate (%) — optional",     type: "number", placeholder: "e.g. 2.5", min: 0 },
        { name: "chargebackRate",  label: "Chargeback Rate (%) — optional", type: "number", placeholder: "e.g. 0.5", min: 0 },
        { name: "holdsFunds",      label: "Does the business hold customer funds?", type: "select", options: [
          { value: "no",  label: "No" },
          { value: "yes", label: "Yes — we hold funds before disbursing" },
        ]},
        { name: "businessAge",     label: "Business Age", type: "select", required: true, options: [
          { value: "less_than_6",  label: "Less than 6 months" },
          { value: "6_to_12",      label: "6-12 months" },
          { value: "1_to_2",       label: "1-2 years" },
          { value: "2_plus",       label: "2+ years" },
        ]},
        { name: "deliveryTime",    label: "Delivery Time", type: "select", required: true, options: [
          { value: "instant",      label: "Instant / same-day" },
          { value: "delayed",      label: "Delayed (days/weeks)" },
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
        { name: "volumeTab", label: "Entry Method", type: "select", options: [
          { value: "manual",  label: "Manual Entry" },
        ]},
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
      title: "Brand & Pricing",
      subtitle: "Select brand and review pricing recommendation",
      fields: [
        { name: "brand", label: "Brand", type: "select", options: [
          { value: "minted", label: "Minted Pay" },
          { value: "ummah",  label: "Ummah Pay" },
        ]},
      ],
    },
    {
      id: 10,
      title: "Pricing & Output",
      subtitle: "Review the pricing recommendation and risk assessment",
      isOutput: true,
    },
  ];

  // ── Resume step helper ────────────────────────────────────
  // Returns the first step that hasn't been filled yet.
  function getLastStep(lead) {
    if (!lead.businessName)                                           return 1;
    if (!lead.salesChannels)                                          return 2;
    if (!lead.paymentTypes)                                           return 3;
    if (!lead.intlPercentage && lead.intlPercentage !== 0)            return 4;
    if (!lead.businessAge)                                            return 4;
    if (!lead.deliveryTime)                                           return 4;
    if (!lead.currentProvider)                                        return 5;
    if (!lead.platform)                                               return 6;
    if (!lead.monthlyVolume)                                          return 7;
    if (!lead.contactName)                                            return 8;
    if (!lead.brand)                                                  return 9;
    return 10;
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
      this.showingOverview = false;
      this.overlay       = document.getElementById("lead-flow");
      this.quoteGenerated = false;
      this.isSubmitting   = false;
    }

    // ── Public: open (new or resume or show overview) ─────────
    async open(existingLead) {
      this.isRejected    = false;
      this._rejectReason = "";
      this.pricingResult = null;
      this.riskResult    = null;
      this.showingOverview = false;

      if (existingLead) {
        this.lead    = { ...existingLead };
        this.leadId  = existingLead.id;
        this.showingOverview = true;
        this.currentStep = 1;
      } else {
        this.lead       = { brand: "minted" };
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

    // ── Render entire flow ─────────────────────────────────
    _render() {
      if (this.showingOverview) {
        this.overlay.innerHTML = this._buildOverview();
      } else {
        this.overlay.innerHTML = this._buildLayout();
      }
      this._bindEvents();
      if (!this.showingOverview && this.currentStep === 10 && !this.pricingResult && !this.isRejected) {
        this._calculateOutput();
      }
    }

    // ── Build Lead Overview Page ───────────────────────────
    _buildOverview() {
      const lead = this.lead;
      const displayVal = (v) => v !== undefined && v !== null && v !== "" ? String(v) : "—";
      const badge = (text, color = "gray") => {
        const colorClass = color === "green" ? "lf-badge-green" :
                          color === "red" ? "lf-badge-red" :
                          color === "amber" ? "lf-badge-amber" : "lf-badge-gray";
        return `<span class="lf-badge ${colorClass}">${text}</span>`;
      };

      let html = `
        <div class="lf-overview">
          <div class="lf-overview-header">
            <div class="lf-overview-title">
              <h1>${lead.businessName || "Lead Overview"}</h1>
              <p>${lead.country || ""}</p>
            </div>
            <button class="lf-back-btn" id="lf-overview-close">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              Back to Dashboard
            </button>
          </div>

          <div class="lf-overview-grid">
      `;

      // Business Info
      html += `
        <div class="lf-overview-card">
          <h3>Business Info</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Business Name</span>
              <span class="lf-overview-value">${displayVal(lead.businessName)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Industry</span>
              <span class="lf-overview-value">${displayVal(lead.industry)} ${lead.industryDetail ? `(${lead.industryDetail})` : ""}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Country</span>
              <span class="lf-overview-value">${displayVal(lead.country)}</span>
            </div>
          </div>
        </div>
      `;

      // Business Model
      html += `
        <div class="lf-overview-card">
          <h3>Business Model</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Sales Channels</span>
              <span class="lf-overview-value">${displayVal(lead.salesChannels)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Payment Types</span>
              <span class="lf-overview-value">${displayVal(lead.paymentTypes)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Website</span>
              <span class="lf-overview-value">${lead.website ? `<a href="${lead.website}" target="_blank">${lead.website}</a>` : "—"}</span>
            </div>
          </div>
        </div>
      `;

      // Risk Signals
      html += `
        <div class="lf-overview-card">
          <h3>Risk Signals</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Intl Transactions</span>
              <span class="lf-overview-value">${displayVal(lead.intlPercentage)}%</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Refund Rate</span>
              <span class="lf-overview-value">${displayVal(lead.refundRate)}%</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Chargeback Rate</span>
              <span class="lf-overview-value">${displayVal(lead.chargebackRate)}%</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Holds Funds</span>
              <span class="lf-overview-value">${lead.holdsFunds === "yes" ? badge("YES", "amber") : "No"}</span>
            </div>
          </div>
        </div>
      `;

      // Current Setup
      html += `
        <div class="lf-overview-card">
          <h3>Current Setup</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Current Provider</span>
              <span class="lf-overview-value">${displayVal(lead.currentProvider)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Pain Points</span>
              <span class="lf-overview-value">${displayVal(lead.painPoints)}</span>
            </div>
          </div>
        </div>
      `;

      // Tech Stack
      html += `
        <div class="lf-overview-card">
          <h3>Tech Stack</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Platform</span>
              <span class="lf-overview-value">${displayVal(lead.platform)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Integrations</span>
              <span class="lf-overview-value">${displayVal(lead.integrations)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Accounting</span>
              <span class="lf-overview-value">${displayVal(lead.accountingSoftware)}</span>
            </div>
          </div>
        </div>
      `;

      // Volume
      html += `
        <div class="lf-overview-card">
          <h3>Volume</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Monthly Volume</span>
              <span class="lf-overview-value">£${lead.monthlyVolume ? parseFloat(lead.monthlyVolume).toLocaleString("en-GB") : "—"}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Avg Transaction</span>
              <span class="lf-overview-value">£${displayVal(lead.avgTransactionValue)}</span>
            </div>
          </div>
        </div>
      `;

      // Results (if available)
      if (lead.processingRate || lead.fixedFee || lead.riskLevel) {
        html += `
          <div class="lf-overview-card">
            <h3>Results</h3>
            <div class="lf-overview-rows">
              ${lead.processingRate ? `
              <div class="lf-overview-row">
                <span class="lf-overview-label">Processing Rate</span>
                <span class="lf-overview-value">${lead.processingRate}%</span>
              </div>` : ""}
              ${lead.fixedFee ? `
              <div class="lf-overview-row">
                <span class="lf-overview-label">Fixed Fee</span>
                <span class="lf-overview-value">${lead.fixedFee}p</span>
              </div>` : ""}
              ${lead.estimatedRevenue ? `
              <div class="lf-overview-row">
                <span class="lf-overview-label">Estimated Revenue</span>
                <span class="lf-overview-value">£${lead.estimatedRevenue}</span>
              </div>` : ""}
              ${lead.margin ? `
              <div class="lf-overview-row">
                <span class="lf-overview-label">Margin</span>
                <span class="lf-overview-value">~${lead.margin}% pts</span>
              </div>` : ""}
              ${lead.riskLevel ? `
              <div class="lf-overview-row">
                <span class="lf-overview-label">Risk Level</span>
                <span class="lf-overview-value">${badge(lead.riskLevel.toUpperCase(), lead.riskLevel === "low" ? "green" : lead.riskLevel === "medium" ? "amber" : "red")}</span>
              </div>` : ""}
              ${lead.decision ? `
              <div class="lf-overview-row">
                <span class="lf-overview-label">Decision</span>
                <span class="lf-overview-value">${badge(lead.decision.toUpperCase(), lead.decision === "accept" ? "green" : lead.decision === "review" ? "amber" : "red")}</span>
              </div>` : ""}
            </div>
          </div>
        `;
      }

      // CRM Info
      html += `
        <div class="lf-overview-card">
          <h3>CRM Info</h3>
          <div class="lf-overview-rows">
            <div class="lf-overview-row">
              <span class="lf-overview-label">Status</span>
              <span class="lf-overview-value">${lead.status ? badge(lead.status.toUpperCase(), lead.status === "qualified" || lead.status === "kyb_pending" ? "green" : "gray") : "—"}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Assigned To</span>
              <span class="lf-overview-value">${displayVal(lead.assignedTo)}</span>
            </div>
            <div class="lf-overview-row">
              <span class="lf-overview-label">Brand</span>
              <span class="lf-overview-value">${lead.brand === "ummah" ? "Ummah Pay" : "Minted Pay"}</span>
            </div>
            ${lead.notesCount ? `
            <div class="lf-overview-row">
              <span class="lf-overview-label">Notes</span>
              <span class="lf-overview-value">${lead.notesCount} note${lead.notesCount > 1 ? "s" : ""}</span>
            </div>` : ""}
            <div class="lf-overview-row">
              <span class="lf-overview-label">Zoho Pushed</span>
              <span class="lf-overview-value">${lead.zohoPushed ? badge("YES", "green") : "No"}</span>
            </div>
          </div>
        </div>
      `;

      html += `
          </div>

          <div class="lf-overview-actions">
            <button class="lf-act-btn lf-act-primary" id="lf-overview-edit">✏️ Edit Lead</button>
            <button class="lf-act-btn lf-act-secondary" id="lf-overview-resume">▶️ Resume Flow</button>
            <button class="lf-act-btn lf-act-secondary" id="lf-overview-quote" ${lead.zohoPushed || !lead.processingRate ? "disabled" : ""}>📄 Generate Quote</button>
          </div>
        </div>
      `;

      return html;
    }

    // ── Main layout skeleton ───────────────────────────────
    _buildLayout() {
      const progress = Math.round((this.currentStep / (this.totalSteps - 1)) * 100);
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
              ${STEPS.map((s, i) => {
                if (s.isOutput) return "";
                return `
                <span class="lf-dot ${i + 1 < this.currentStep ? 'done' : i + 1 === this.currentStep ? 'active' : ''}"
                      title="Step ${s.id}: ${s.title}"></span>
              `;
              }).join("")}
            </div>
            <div class="lf-progress-bar">
              <div class="lf-progress-fill" style="width:${progress}%"></div>
            </div>
            <div class="lf-step-label">Step ${this.currentStep} of ${this.totalSteps - 1} — <em>${stepDef.title}</em></div>
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
          ${"" /* CSV upload disabled temporarily — will re-enable later */}
        </div>
      `;
    }

    // ── CSV Upload Tab for Step 7 ───────────────────────────
    _buildCSVUploadTab() {
      return `
        <div class="lf-csv-upload-section" id="lf-csv-upload-section">
          <h3>Or Upload CSV</h3>
          <div class="lf-dropzone" id="lf-csv-dropzone">
            <p>Drag and drop CSV file here</p>
            <input type="file" id="lf-csv-file-input" accept=".csv" style="display:none;">
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

    // ── Output step (Step 10) ───────────────────────────────
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
            <div class="lf-step-num">Step 10</div>
            <h2 class="lf-step-title">Pricing &amp; Output</h2>
            <p class="lf-step-sub">
              Recommendation for <strong>${this.lead.businessName || "this lead"}</strong>
              ${this.lead.country ? "· " + this.lead.country : ""}
            </p>
          </div>

          <div class="lf-output-grid">
            <!-- Pricing card with manual override -->
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

              <div class="lf-pricing-override">
                <h4>Manual Override</h4>
                <div class="lf-override-fields">
                  <div class="lf-override-field">
                    <label>Processing Rate (%)</label>
                    <input type="number" id="lf-override-rate" value="${p.rate}" min="0" step="0.01">
                  </div>
                  <div class="lf-override-field">
                    <label>Fixed Fee (pence)</label>
                    <input type="number" id="lf-override-fixed" value="${p.fixed_fee}" min="10" step="1">
                  </div>
                </div>
                <button class="lf-act-btn lf-act-secondary" id="lf-apply-override">Apply Override</button>
              </div>

              <div class="lf-fee-toggles">
                <h4>Fee Toggles</h4>
                <div class="lf-fee-toggle">
                  <label>
                    <input type="checkbox" id="lf-toggle-amex" checked>
                    Amex Fee (<span id="lf-amex-val">3.5</span>%)
                  </label>
                  <input type="number" id="lf-amex-input" value="3.5" min="0" step="0.1">
                </div>
                <div class="lf-fee-toggle">
                  <label>
                    <input type="checkbox" id="lf-toggle-fx" checked>
                    FX Fee (<span id="lf-fx-val">1.5</span>%)
                  </label>
                  <input type="number" id="lf-fx-input" value="1.5" min="0" step="0.1">
                </div>
                <div class="lf-fee-toggle">
                  <label>
                    <input type="checkbox" id="lf-toggle-chargeback" checked>
                    Chargeback Fee (£<span id="lf-chargeback-val">15</span>)
                  </label>
                  <input type="number" id="lf-chargeback-input" value="15" min="0" step="1">
                </div>
                <div class="lf-fee-toggle">
                  <label>
                    <input type="checkbox" id="lf-toggle-refund" checked>
                    Refund Fee (£<span id="lf-refund-val">1</span>)
                  </label>
                  <input type="number" id="lf-refund-input" value="1" min="0" step="1">
                </div>
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
            <button class="lf-act-btn lf-act-primary" id="lf-gen-quote" ${!this.lead.zohoPushed && this.lead.processingRate ? "" : "disabled"}>
              📄 Generate Quote
            </button>
            <button class="lf-act-btn lf-act-secondary" id="lf-push-zoho" ${!this.lead.zohoPushed ? "" : "disabled"}>
              ${this.lead.zohoPushed ? "✓ Pushed to Zoho" : "☁️ Push to Zoho"}
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

      // Overview page
      q("lf-overview-close")?.addEventListener("click", () => this.close());
      q("lf-overview-edit")?.addEventListener("click", () => {
        this.showingOverview = false;
        this.currentStep = 1;
        this._render();
      });
      q("lf-overview-resume")?.addEventListener("click", () => {
        this.showingOverview = false;
        this.currentStep = this._resumeStep();
        this._render();
      });
      q("lf-overview-quote")?.addEventListener("click", () => {
        if (this.lead.processingRate && !this.lead.zohoPushed) {
          this._generateQuote();
        }
      });

      // Main flow
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

      q("lf-apply-override")?.addEventListener("click", () => this._applyPricingOverride());

      // Fee toggle listeners
      ["amex", "fx", "chargeback", "refund"].forEach(fee => {
        q(`lf-toggle-${fee}`)?.addEventListener("change", (e) => {
          q(`lf-${fee}-input`).disabled = !e.target.checked;
        });
        q(`lf-${fee}-input`)?.addEventListener("change", (e) => {
          q(`lf-${fee}-val`).textContent = e.target.value;
        });
      });

      // Input autosave
      this.overlay.querySelectorAll(".lf-ctrl").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          this.lead[e.target.name] = e.target.value;
          if (e.target.name === "paymentTypes") this._updateConditional();
          this._scheduleSave();
        });
      });

      // CSV Upload
      const dropzone = q("lf-csv-dropzone");
      const fileInput = q("lf-csv-file-input");
      if (dropzone && fileInput) {
        dropzone.addEventListener("click", () => fileInput.click());
        dropzone.addEventListener("dragover", (e) => {
          e.preventDefault();
          dropzone.style.borderColor = "#3b82f6";
        });
        dropzone.addEventListener("dragleave", () => {
          dropzone.style.borderColor = "";
        });
        dropzone.addEventListener("drop", (e) => {
          e.preventDefault();
          dropzone.style.borderColor = "";
          if (e.dataTransfer.files.length > 0) {
            this._handleCSVFile(e.dataTransfer.files[0]);
          }
        });
        fileInput.addEventListener("change", (e) => {
          if (e.target.files.length > 0) {
            this._handleCSVFile(e.target.files[0]);
          }
        });
      }
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

    // ── Handle CSV File Upload ──────────────────────────────
    async _handleCSVFile(file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const csv = e.target.result;
        try {
          // Strip currency symbols helper
          const stripCurrency = (val) => {
            if (!val) return 0;
            return parseFloat(String(val).replace(/[£$€,\s]/g, "")) || 0;
          };

          const lines = csv.split("\n").filter(l => l.trim());
          if (lines.length < 2) {
            alert("CSV must have at least a header row and one data row.");
            return;
          }

          const header = lines[0].toLowerCase().split(",").map(h => h.trim());

          // Flexible header matching
          const findCol = (names) => {
            for (const name of names) {
              const idx = header.indexOf(name);
              if (idx >= 0) return idx;
            }
            return -1;
          };

          const volIdx   = findCol(["monthlyvolume", "monthly_volume", "volume", "vol", "total_volume", "totalvolume"]);
          const avgIdx   = findCol(["avgtransactionvalue", "avg_transaction_value", "avgtx", "avg_tx", "average_value", "averagevalue"]);
          const cntIdx   = findCol(["transactioncount", "transaction_count", "count", "cnt", "transactions"]);
          const amountIdx = findCol(["amount", "value", "total"]);

          // Parse all data rows to compute aggregates
          let totalVolume = 0;
          let totalCount  = 0;
          let totalAmount = 0;

          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(",").map(v => v.trim());
            if (row.length < 2 && !row[0]) continue; // skip empty rows

            if (volIdx >= 0) totalVolume += stripCurrency(row[volIdx]);
            if (cntIdx >= 0) totalCount  += stripCurrency(row[cntIdx]);
            if (amountIdx >= 0) totalAmount += stripCurrency(row[amountIdx]);
          }

          // If explicit monthlyVolume column found, use first row value
          if (volIdx >= 0) {
            const firstRow = lines[1].split(",").map(v => v.trim());
            this.lead.monthlyVolume = stripCurrency(firstRow[volIdx]);
          } else if (totalAmount > 0) {
            // Fallback: sum all amounts as total volume
            this.lead.monthlyVolume = totalAmount;
          }

          if (avgIdx >= 0) {
            const firstRow = lines[1].split(",").map(v => v.trim());
            this.lead.avgTransactionValue = stripCurrency(firstRow[avgIdx]);
          } else if (totalAmount > 0 && (lines.length - 1) > 0) {
            // Derive avg from total / row count
            this.lead.avgTransactionValue = Math.round((totalAmount / (lines.length - 1)) * 100) / 100;
          }

          if (cntIdx >= 0) {
            this.lead.transactionCount = totalCount;
          } else if (this.lead.monthlyVolume && this.lead.avgTransactionValue) {
            this.lead.transactionCount = Math.round(this.lead.monthlyVolume / this.lead.avgTransactionValue);
          }

          await this._saveNow();
          this._render();
        } catch (err) {
          console.error("CSV parse error:", err);
          // Non-blocking: don't prevent user from continuing
          alert("Could not fully parse CSV. You can still enter values manually.");
        }
      };
      reader.readAsText(file);
    }

    // ── Apply Pricing Override ──────────────────────────────
    _applyPricingOverride() {
      const rateEl = document.getElementById("lf-override-rate");
      const fixedEl = document.getElementById("lf-override-fixed");
      if (!rateEl || !fixedEl) return;

      const newRate = parseFloat(rateEl.value) || this.pricingResult.rate;
      const newFixed = parseFloat(fixedEl.value) || this.pricingResult.fixed_fee;

      // Validation
      const minFixed = 10; // pence
      const minRate = 0.76; // 0.46 cost + 0.30 margin
      let warnings = [];

      if (newFixed < minFixed) warnings.push(`Fixed fee must be at least ${minFixed}p`);
      if (newRate < minRate) warnings.push(`Rate must be at least ${minRate}% (cost 0.46 + margin 0.30)`);

      if (warnings.length > 0) {
        alert("Pricing validation failed:\n" + warnings.join("\n"));
        return;
      }

      // Apply
      this.pricingResult.rate = newRate;
      this.pricingResult.fixed_fee = newFixed;
      this.lead.processingRate = newRate;
      this.lead.fixedFee = newFixed;
      this._scheduleSave();
      this._render();
    }

    // ── Determine which step to resume at ─────────────────
    _resumeStep() {
      return getLastStep(this.lead);
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

      // Step 2: Website validation
      if (this.currentStep === 2 && this.lead.website) {
        const website = this.lead.website.trim();
        if (!/^https?:\/\//.test(website)) {
          this.lead.website = "https://" + website;
        }
        if (!/^https?:\/\/[^\s@]+\.[^\s@]+$/.test(this.lead.website)) {
          this._fieldError("lf-website", "Invalid website URL format");
          return;
        }
      }

      // Step 4: intlPercentage must be provided
      if (this.currentStep === 4) {
        if (this.lead.intlPercentage === undefined || this.lead.intlPercentage === null || this.lead.intlPercentage === "") {
          this._fieldError("lf-intlPercentage", "International transactions percentage is required");
          return;
        }
      }

      // Step 8: Email validation
      if (this.currentStep === 8 && this.lead.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(this.lead.email)) {
          this._fieldError("lf-email", "Invalid email address");
          return;
        }
      }

      // Step 1 → qualification gate
      if (this.currentStep === 1) {
        const check = window.RiskEngine.checkQualification(this.lead.country, this.lead.industryDetail || this.lead.industry);
        if (!check.allowed) {
          this._rejectReason = check.reason;
          this.isRejected    = true;
          await this._saveNow({ status: "rejected" });
          this.onSaved();
          this._render();
          return;
        }
        if (check.restricted) {
          alert("⚠️ " + check.reason);
        }
      }

      this.currentStep++;
      await this._saveNow();
      this._render();

      if (this.currentStep === 10) this._calculateOutput();
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

    // ── Step 10: call pricing API + risk engine ──────────
    async _calculateOutput() {
      this.isCalculating = true;
      const body = document.getElementById("lf-body");
      if (body) body.innerHTML = `
        <div class="lf-step-wrap lf-output">
          <div class="lf-calculating"><div class="lf-spinner"></div>
            <p>Calculating pricing &amp; risk assessment…</p></div>
        </div>`;

      const vol   = parseFloat(this.lead.monthlyVolume)       || 0;
      const avgTx = parseFloat(this.lead.avgTransactionValue) || 55;
      const txCnt = avgTx > 0 ? Math.round(vol / avgTx) : Math.round(vol / 55);

      try {
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
          this.lead.processingRate = data.rate;
          this.lead.fixedFee = data.fixed_fee;
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
      if (this.quoteGenerated) {
        alert("Quote already generated. Please view the existing quote.");
        return;
      }
      if (this.isSubmitting) return;
      this.isSubmitting = true;

      // Disable button immediately to prevent double clicks
      const btn = document.getElementById("lf-gen-quote");
      if (btn) btn.disabled = true;

      try {
        this.quoteGenerated = true;
        this.lead.status = "quoted";
        await this._saveNow({ status: "quoted" });
        this.onSaved();
        window.open(`/quote.html?quote=${this.pricingResult.quote_id}`, "_blank");

        // Auto-push to Zoho ONCE after quote generation
        if (!this.lead.zohoPushed) {
          try {
            const resp = await fetch(`/api/leads/${this.leadId}/push-zoho`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
            });
            if (resp.ok) {
              this.lead.zohoPushed = true;
            }
          } catch (zohoErr) {
            console.error("Zoho auto-push after quote failed:", zohoErr);
            // Non-blocking — quote was still generated
          }
        }

        this._render();
      } finally {
        this.isSubmitting = false;
      }
    }

    // ── Action: Push to Zoho ────────────────────────────────
    async _pushZoho() {
      if (this.lead.zohoPushed) {
        alert("This lead has already been pushed to Zoho.");
        return;
      }
      if (this.isSubmitting) return;
      this.isSubmitting = true;
      const btn = document.getElementById("lf-push-zoho");
      if (!btn) { this.isSubmitting = false; return; }
      btn.textContent = "Pushing…";
      btn.disabled    = true;
      try {
        const resp = await fetch(`/api/leads/${this.leadId}/push-zoho`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (resp.ok) {
          this.lead.zohoPushed = true;
          await this._saveNow({ zohoPushed: true });
          this.onSaved();
          btn.textContent = "✓ Pushed to Zoho";
          btn.classList.add("lf-act-done");
          btn.disabled = true;
        } else {
          btn.textContent = "☁️ Push to Zoho";
          btn.disabled = false;
          alert("Failed to push to Zoho. Please try again.");
        }
      } catch (e) {
        console.error("Push to Zoho error:", e);
        btn.textContent = "☁️ Push to Zoho";
        btn.disabled = false;
        alert("Error pushing to Zoho. Please try again.");
      } finally {
        this.isSubmitting = false;
      }
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
