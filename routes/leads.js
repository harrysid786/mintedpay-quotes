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
      const empty = (v) => v === undefined || v === null || v === "";
      const val = (v, suffix = "") => empty(v) ? `<span class="ov-empty">Not provided</span>` : `${String(v)}${suffix}`;
      const badge = (text, color = "gray") => {
        const cls = color === "green" ? "lf-badge-green" :
                    color === "red" ? "lf-badge-red" :
                    color === "amber" ? "lf-badge-amber" :
                    color === "blue" ? "bd-blue" : "bd-grey";
        return `<span class="lf-badge ${cls}">${text}</span>`;
      };

      // Status badge for header
      const statusColor = { qualified: "green", kyb_pending: "green", live: "green", quoted: "blue", rejected: "red" };
      const statusCls = statusColor[lead.status] || "gray";
      const statusLabel = (lead.status || "draft").replace(/_/g, " ").toUpperCase();

      // Risk badge for header
      const riskColor = lead.riskLevel === "low" ? "green" : lead.riskLevel === "medium" ? "amber" : lead.riskLevel === "high" ? "red" : "";

      // Volume helpers
      const vol   = parseFloat(lead.monthlyVolume) || 0;
      const avgTx = parseFloat(lead.avgTransactionValue) || 0;

      // Activity timeline helper
      const activity = Array.isArray(lead.activity) ? lead.activity : [];
      const activityLabels = {
        lead_created: "Lead created",
        status_changed: "Status changed",
        note_added: "Note added",
        kyb_submitted: "KYB submitted",
        archived: "Lead archived",
        reassigned: "Lead reassigned",
        zoho_pushed: "Pushed to Zoho",
        quote_generated: "Quote generated",
      };
      const activityIcons = {
        lead_created: "🆕",
        status_changed: "🔄",
        note_added: "📝",
        kyb_submitted: "🔐",
        archived: "📦",
        reassigned: "👤",
        zoho_pushed: "☁️",
        quote_generated: "📄",
      };
      const highlightedEvents = ["quote_generated", "zoho_pushed"];

      const fmtTs = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      };

      const fmtDate = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      };

      // Group activity by date
      const groupedActivity = [...activity].reverse().reduce((acc, a) => {
        const dateKey = fmtDate(a.timestamp);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(a);
        return acc;
      }, {});

      // Notes helper
      const notes = Array.isArray(lead.notes) ? lead.notes : [];

      // Action button states
      const isKYB = lead.status === "kyb_pending";
      const hasQuote = !!lead.quote_id;
      // Pricing: prefer live pricingResult, fall back to saved lead data
      const rate     = this.pricingResult?.rate     ?? lead.processingRate;
      const fixedFee = this.pricingResult?.fixed_fee ?? lead.fixedFee;

      return `
        <div class="ov-page">
          <!-- ═══ STICKY HEADER ═══ -->
          <div class="ov-topbar">
            <button class="ov-back" id="lf-overview-close">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Dashboard
            </button>
            <div class="ov-topbar-center">
              <h1 class="ov-biz-name">${lead.businessName || "Untitled Lead"}</h1>
              <div class="ov-biz-meta">
                ${lead.country ? `<span class="ov-country">${lead.country}</span>` : ""}
                ${badge(statusLabel, statusCls)}
                ${riskColor ? badge(lead.riskLevel.toUpperCase() + " RISK", riskColor) : ""}
                ${lead.brand && lead.brand !== "minted" ? `<span class="db-brand-badge">${lead.brand.toUpperCase()}</span>` : ""}
              </div>
            </div>
            <div class="ov-topbar-actions">
              <button class="ov-btn ov-btn-primary" id="lf-overview-edit">Edit Lead</button>
              <button class="ov-btn ov-btn-secondary" id="lf-overview-resume">Resume Flow</button>
            </div>
          </div>

          <div class="ov-body">

            <!-- ═══ 70/30 LAYOUT ═══ -->
            <div class="ov-cols">

              <!-- ═══ LEFT COLUMN (70%) ═══ -->
              <div class="ov-col-left">

                <!-- Pricing Summary Banner (if pricing exists) -->
                ${rate || fixedFee ? `
                <div class="ov-summary-banner">
                  <div class="ov-summary-row">
                    <div class="ov-summary-item">
                      <div class="ov-summary-label">Processing Rate</div>
                      <div class="ov-summary-value">${rate}%</div>
                    </div>
                    <div class="ov-summary-item">
                      <div class="ov-summary-label">Fixed Fee</div>
                      <div class="ov-summary-value">${fixedFee}p</div>
                    </div>
                    ${lead.estimatedRevenue ? `
                    <div class="ov-summary-item">
                      <div class="ov-summary-label">Est. Revenue</div>
                      <div class="ov-summary-value">£${lead.estimatedRevenue}</div>
                    </div>` : ""}
                    ${riskColor ? `
                    <div class="ov-summary-item">
                      <div class="ov-summary-label">Risk Level</div>
                      <div class="ov-summary-value">${badge(lead.riskLevel.toUpperCase(), riskColor)}</div>
                    </div>` : ""}
                  </div>
                </div>` : ""}

                <!-- Pricing Summary (large hero card) -->
                ${rate || fixedFee || lead.riskLevel ? `
                <div class="ov-results-hero">
                  <div class="ov-results-grid">
                    ${rate ? `
                    <div class="ov-result-item ov-result-highlight">
                      <div class="ov-result-label">Processing Rate</div>
                      <div class="ov-result-value">${rate}%</div>
                    </div>` : ""}
                    ${fixedFee ? `
                    <div class="ov-result-item ov-result-highlight">
                      <div class="ov-result-label">Fixed Fee</div>
                      <div class="ov-result-value">${fixedFee}p</div>
                    </div>` : ""}
                    ${lead.riskLevel ? `
                    <div class="ov-result-item">
                      <div class="ov-result-label">Risk Level</div>
                      <div class="ov-result-badge">${badge(lead.riskLevel.toUpperCase(), riskColor)}</div>
                    </div>` : ""}
                    ${lead.decision ? `
                    <div class="ov-result-item">
                      <div class="ov-result-label">Decision</div>
                      <div class="ov-result-badge">${badge(lead.decision.toUpperCase(), lead.decision === "accept" ? "green" : lead.decision === "review" ? "amber" : "red")}</div>
                    </div>` : ""}
                    ${vol > 0 ? `
                    <div class="ov-result-item">
                      <div class="ov-result-label">Monthly Volume</div>
                      <div class="ov-result-value ov-result-sm">\u00A3${vol.toLocaleString("en-GB")}</div>
                    </div>` : ""}
                    ${lead.estimatedRevenue ? `
                    <div class="ov-result-item">
                      <div class="ov-result-label">Est. Revenue</div>
                      <div class="ov-result-value ov-result-sm">\u00A3${lead.estimatedRevenue}</div>
                    </div>` : ""}
                  </div>
                </div>` : ""}

                <!-- Business Info -->
                <div class="ov-card">
                  <div class="ov-card-hdr">Business Info</div>
                  <div class="ov-card-body">
                    <div class="ov-field">
                      <div class="ov-field-label">Business Name</div>
                      <div class="ov-field-value">${val(lead.businessName)}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Industry</div>
                      <div class="ov-field-value">${val(lead.industry)}${lead.industryDetail ? ` <span class="ov-detail">(${lead.industryDetail})</span>` : ""}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Country</div>
                      <div class="ov-field-value">${val(lead.country)}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Sales Channels</div>
                      <div class="ov-field-value">${val(lead.salesChannels)}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Website</div>
                      <div class="ov-field-value">${lead.website ? `<a href="${lead.website}" target="_blank">${lead.website}</a>` : `<span class="ov-empty">Not provided</span>`}</div>
                    </div>
                    ${!empty(lead.description) ? `
                    <div class="ov-field">
                      <div class="ov-field-label">Description</div>
                      <div class="ov-field-value">${lead.description}</div>
                    </div>` : ""}
                  </div>
                </div>

                <!-- Risk Signals -->
                <div class="ov-card">
                  <div class="ov-card-hdr">Risk Signals</div>
                  <div class="ov-card-body">
                    <div class="ov-field">
                      <div class="ov-field-label">Intl Transactions</div>
                      <div class="ov-field-value">${empty(lead.intlPercentage) ? `<span class="ov-empty">Not provided</span>` : lead.intlPercentage + "%"}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Refund Rate</div>
                      <div class="ov-field-value">${empty(lead.refundRate) ? `<span class="ov-empty">Not provided</span>` : lead.refundRate + "%"}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Chargeback Rate</div>
                      <div class="ov-field-value">${empty(lead.chargebackRate) ? `<span class="ov-empty">Not provided</span>` : lead.chargebackRate + "%"}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Holds Funds</div>
                      <div class="ov-field-value">${lead.holdsFunds === "yes" ? badge("YES", "amber") : "No"}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Business Age</div>
                      <div class="ov-field-value">${val(lead.businessAge)}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Delivery Time</div>
                      <div class="ov-field-value">${val(lead.deliveryTime)}</div>
                    </div>
                  </div>
                </div>

                <!-- Volume & Current Setup -->
                <div class="ov-card">
                  <div class="ov-card-hdr">Volume & Setup</div>
                  <div class="ov-card-body">
                    <div class="ov-field">
                      <div class="ov-field-label">Monthly Volume</div>
                      <div class="ov-field-value">${vol > 0 ? "\u00A3" + vol.toLocaleString("en-GB") : `<span class="ov-empty">Not provided</span>`}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Avg Transaction</div>
                      <div class="ov-field-value">${avgTx > 0 ? "\u00A3" + avgTx : `<span class="ov-empty">Not provided</span>`}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Current Provider</div>
                      <div class="ov-field-value">${val(lead.currentProvider)}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Platform</div>
                      <div class="ov-field-value">${val(lead.platform)}</div>
                    </div>
                    ${!empty(lead.painPoints) ? `
                    <div class="ov-field">
                      <div class="ov-field-label">Pain Points</div>
                      <div class="ov-field-value">${lead.painPoints}</div>
                    </div>` : ""}
                  </div>
                </div>

                <!-- Contact -->
                <div class="ov-card">
                  <div class="ov-card-hdr">Contact</div>
                  <div class="ov-card-body">
                    <div class="ov-field">
                      <div class="ov-field-label">Name</div>
                      <div class="ov-field-value">${val(lead.contactName)}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Email</div>
                      <div class="ov-field-value">${lead.email ? `<a href="mailto:${lead.email}">${lead.email}</a>` : `<span class="ov-empty">Not provided</span>`}</div>
                    </div>
                    ${!empty(lead.phone) ? `
                    <div class="ov-field">
                      <div class="ov-field-label">Phone</div>
                      <div class="ov-field-value">${lead.phone}</div>
                    </div>` : ""}
                  </div>
                </div>

              </div><!-- /ov-col-left -->

              <!-- ═══ RIGHT COLUMN (30%) ═══ -->
              <div class="ov-col-right">

                <!-- Actions Card -->
                <div class="ov-card ov-card-actions">
                  <div class="ov-card-hdr">Actions</div>
                  <div class="ov-actions-body">
                    <button class="ov-action-btn ov-action-primary" id="lf-overview-quote" ${this.pricingResult && !this.quoteGenerated ? "" : "disabled"}>
                      ${hasQuote ? "✓ Quote Generated" : "📄 Generate Quote"}
                    </button>
                    ${hasQuote ? `
                    <a class="ov-action-btn ov-action-link" href="/quote.html?quote=${lead.quote_id}" target="_blank">
                      📤 View Quote
                    </a>
                    <button class="ov-action-btn ov-action-secondary" id="lf-send-quote-email">
                      📧 Send via Email
                    </button>
                    <button class="ov-action-btn ov-action-secondary" id="lf-copy-quote-link">
                      📋 Copy Quote Link
                    </button>` : ""}
                    <button class="ov-action-btn ov-action-secondary" id="lf-ov-push-zoho" ${!lead.zohoPushed ? "" : "disabled"}>
                      ${lead.zohoPushed ? "✓ Pushed to Zoho" : "☁️ Push to Zoho"}
                    </button>
                    <button class="ov-action-btn ${isKYB ? "ov-action-done" : "ov-action-kyb"}" id="lf-ov-mark-kyb" ${isKYB ? "disabled" : ""}>
                      ${isKYB ? "✓ KYB Pending" : "🔐 Mark as KYB Ready"}
                    </button>
                  </div>
                  <!-- CRM Meta -->
                  <div class="ov-crm-meta">
                    <div class="ov-crm-row">
                      <span class="ov-crm-label">Assigned</span>
                      <span class="ov-crm-val">${empty(lead.assignedTo) ? "Unassigned" : lead.assignedTo}</span>
                    </div>
                    <div class="ov-crm-row">
                      <span class="ov-crm-label">Brand</span>
                      <span class="ov-crm-val">${lead.brand === "ummah" ? "Ummah Pay" : "Minted Pay"}</span>
                    </div>
                    <div class="ov-crm-row">
                      <span class="ov-crm-label">Zoho</span>
                      <span class="ov-crm-val">${lead.zohoPushed ? badge("SYNCED", "green") : `<span class="ov-empty">Not synced</span>`}</span>
                    </div>
                  </div>
                </div>

                <!-- Risk Reasoning Card -->
                ${lead.riskLevel ? `
                <div class="ov-card ov-card-risk">
                  <div class="ov-card-hdr">Risk Reasoning</div>
                  <div class="ov-card-body">
                    <div class="ov-field">
                      <div class="ov-field-label">Intl Transactions</div>
                      <div class="ov-field-value">${lead.intlPercentage || 0}%</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Industry</div>
                      <div class="ov-field-value">${lead.industry || "—"}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Business Age</div>
                      <div class="ov-field-value">${lead.businessAge || "—"}</div>
                    </div>
                    <div class="ov-field">
                      <div class="ov-field-label">Delivery Time</div>
                      <div class="ov-field-value">${lead.deliveryTime || "—"}</div>
                    </div>
                  </div>
                </div>` : ""}

                <!-- Activity Timeline Card -->
                <div class="ov-card ov-card-timeline">
                  <div class="ov-card-hdr">Activity Timeline</div>
                  <div class="ov-timeline-body">
                    ${activity.length === 0 ? `<div class="ov-timeline-empty">No activity yet</div>` : `
                      ${Object.entries(groupedActivity).map(([dateKey, events]) => `
                        <div class="ov-tl-date-group">
                          <div class="ov-tl-date-header">${dateKey}</div>
                          ${events.map(a => `
                            <div class="ov-tl-item ${highlightedEvents.includes(a.type) ? "ov-tl-highlight" : ""}">
                              <div class="ov-tl-dot"></div>
                              <div class="ov-tl-content">
                                <div class="ov-tl-label">
                                  <span class="ov-tl-icon">${activityIcons[a.type] || "📌"}</span>
                                  ${activityLabels[a.type] || a.type}
                                  ${a.oldStatus && a.newStatus ? `<span class="ov-tl-detail">${a.oldStatus} → ${a.newStatus}</span>` : ""}
                                  ${a.newAssignedTo ? `<span class="ov-tl-detail">→ ${a.newAssignedTo}</span>` : ""}
                                </div>
                                <div class="ov-tl-time">${fmtTs(a.timestamp)}</div>
                              </div>
                            </div>
                          `).join("")}
                        </div>
                      `).join("")}
                    `}
                  </div>
                </div>

                <!-- Notes Card -->
                <div class="ov-card ov-card-notes">
                  <div class="ov-card-hdr">
                    Notes
                    <span class="ov-note-count">${notes.length}</span>
                  </div>
                  <div class="ov-notes-body">
                    ${notes.length === 0 ? `<div class="ov-notes-empty">No notes yet</div>` :
                      [...notes].reverse().map(n => `
                        <div class="ov-note-item">
                          <div class="ov-note-text">${n.text}</div>
                          <div class="ov-note-time">${fmtTs(n.timestamp)}</div>
                        </div>
                      `).join("")
                    }
                    <div class="ov-note-add">
                      <textarea class="ov-note-input" id="lf-ov-note-input" placeholder="Add a note..." rows="2"></textarea>
                      <button class="ov-note-btn" id="lf-ov-add-note">Add Note</button>
                    </div>
                  </div>
                </div>

              </div><!-- /ov-col-right -->
            </div><!-- /ov-cols -->

          </div><!-- /ov-body -->
        </div>
      `;
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

      // Special handling for Step 7: Tab UI for CSV vs Manual
      if (this.currentStep === 7) {
        const activeTab = this.lead.volumeTab || "manual";
        return `
          <div class="lf-step-wrap">
            <div class="lf-step-head">
              <div class="lf-step-num">Step ${s.id}</div>
              <h2 class="lf-step-title">${s.title}</h2>
              <p class="lf-step-sub">${s.subtitle}</p>
            </div>

            <!-- Tab UI for Volume Entry Method -->
            <div class="lf-tab-container">
              <div class="lf-tab-buttons">
                <button class="lf-tab-btn ${activeTab === "manual" ? "active" : ""}" data-tab="manual">
                  Manual Entry
                </button>
                <button class="lf-tab-btn ${activeTab === "csv" ? "active" : ""}" data-tab="csv">
                  Upload CSV
                </button>
              </div>
            </div>

            <!-- Manual Entry Tab -->
            <div class="lf-tab-content ${activeTab === "manual" ? "active" : ""}" data-tab="manual">
              <div class="lf-fields">
                ${s.fields.map(f => this._buildField(f)).join("")}
              </div>
            </div>

            <!-- CSV Upload Tab -->
            <div class="lf-tab-content ${activeTab === "csv" ? "active" : ""}" data-tab="csv">
              ${this._buildCSVUploadTab()}
            </div>
          </div>
        `;
      }

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

    // ── CSV Upload Tab for Step 7 ───────────────────────────
    _buildCSVUploadTab() {
      const hasError = this.lead.csvParseError || false;
      const isLoading = this.lead.csvLoading || false;

      return `
        <div class="lf-csv-upload-section" id="lf-csv-upload-section">
          <div class="lf-fields">
            ${isLoading ? `
            <div class="lf-csv-loading">
              <div class="lf-spinner"></div>
              <p>Parsing CSV file…</p>
            </div>` : ""}

            ${hasError ? `
            <div class="lf-csv-error">
              <span class="lf-csv-error-icon">⚠️</span>
              <span>${this.lead.csvParseError}</span>
            </div>` : ""}

            <div class="lf-dropzone" id="lf-csv-dropzone" ${isLoading ? "disabled" : ""}>
              <p>Drag and drop your CSV file here, or click to browse</p>
              <span class="lf-csv-hint">Supported columns: Amount, Volume, Count, Currency (optional)</span>
              <input type="file" id="lf-csv-file-input" accept=".csv" style="display:none;">
            </div>

            ${this.lead.monthlyVolume && this.lead.volumeTab === "csv" && !isLoading ? `
            <div class="lf-csv-result">
              ✓ Auto-filled: Volume £${parseFloat(this.lead.monthlyVolume).toLocaleString("en-GB")}
              ${this.lead.avgTransactionValue ? ` · Avg Tx £${this.lead.avgTransactionValue}` : ""}
              ${this.lead.transactionCount ? ` · ${this.lead.transactionCount} transactions` : ""}
            </div>` : ""}
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

    // ── Get risk reason explanation ────────────────────────
    _getRiskReasonText(riskLevel, lead) {
      const factors = [];
      const intl = parseFloat(lead.intlPercentage) || 0;
      const cb = parseFloat(lead.chargebackRate) || 0;
      const refund = parseFloat(lead.refundRate) || 0;
      const businessAge = lead.businessAge;

      if (intl > 70) factors.push("High intl % (>70%)");
      else if (intl > 40) factors.push("Elevated intl %");

      if (cb > 2.0) factors.push("High chargeback rate");
      else if (cb > 1.0) factors.push("Moderate chargeback");

      if (refund > 10) factors.push("High refund rate");

      if (lead.holdsFunds === "yes") factors.push("Holds customer funds");

      if (businessAge === "less_than_6") factors.push("Startup (<6mo)");
      else if (businessAge === "6_to_12") factors.push("Early stage (6-12mo)");

      if (lead.deliveryTime === "delayed") factors.push("Delayed delivery");

      if (factors.length === 0) return "Low-risk profile with stable metrics.";
      return factors.slice(0, 3).join(" · ");
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

      // Confidence badge logic
      const hasVolume   = vol > 0;
      const hasAvgTx    = avgTx > 0 && avgTx !== 55;
      const hasRisk     = !!r.riskLevel;
      const hasCountry  = !!this.lead.country;
      const hasIndustry = !!this.lead.industry;
      const dataPoints  = [hasVolume, hasAvgTx, hasRisk, hasCountry, hasIndustry].filter(Boolean).length;
      const confidence  = dataPoints >= 4 ? "HIGH" : dataPoints >= 2 ? "MEDIUM" : "LOW";
      const confClass   = confidence === "HIGH" ? "lf-conf-high" : confidence === "MEDIUM" ? "lf-conf-med" : "lf-conf-low";

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

          <!-- ═══ SECTION 1: System Recommendation (read-only) ═══ -->
          <div class="lf-section-card lf-section-recommendation">
            <div class="lf-section-hdr">
              <span class="lf-section-icon">💰</span>
              <span class="lf-section-title">System Recommendation</span>
              <span class="lf-conf-badge ${confClass}">Confidence: ${confidence}</span>
            </div>
            <div class="lf-rec-grid">
              <div class="lf-rec-item lf-rec-primary">
                <div class="lf-rec-label">Processing Rate</div>
                <div class="lf-rec-value">${p.rate}%</div>
              </div>
              <div class="lf-rec-item lf-rec-primary">
                <div class="lf-rec-label">Fixed Fee</div>
                <div class="lf-rec-value">${p.fixed_fee}p</div>
              </div>
              <div class="lf-rec-item">
                <div class="lf-rec-label">Est. Monthly Revenue</div>
                <div class="lf-rec-value lf-rec-sm">£${estRev.toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
              </div>
              <div class="lf-rec-item">
                <div class="lf-rec-label">Est. Gross Margin</div>
                <div class="lf-rec-value lf-rec-sm">~${estMrg}% pts</div>
              </div>
            </div>
            ${p.monthly_saving > 0 ? `
            <div class="lf-savings-banner">
              <span>Saving vs Current Provider</span>
              <strong>£${p.monthly_saving.toLocaleString("en-GB")}/mo</strong>
            </div>` : ""}
          </div>

          <div class="lf-output-cols">
            <!-- ═══ LEFT COLUMN ═══ -->
            <div class="lf-output-left">

              <!-- ═══ SECTION 2: Manual Overrides ═══ -->
              <div class="lf-section-card lf-section-overrides">
                <div class="lf-section-hdr">
                  <span class="lf-section-icon">✏️</span>
                  <span class="lf-section-title">Manual Overrides</span>
                </div>
                <div class="lf-adj-grid">
                  <div class="lf-adj-field">
                    <label class="lf-adj-label">Processing Rate (%)</label>
                    <input type="number" class="lf-adj-input" id="lf-override-rate" value="${p.rate}" min="0" step="0.01">
                  </div>
                  <div class="lf-adj-field">
                    <label class="lf-adj-label">Fixed Fee (pence)</label>
                    <input type="number" class="lf-adj-input" id="lf-override-fixed" value="${p.fixed_fee}" min="10" step="1">
                  </div>
                </div>
                <button class="lf-update-btn" id="lf-apply-override">Update Pricing</button>
              </div>

              <!-- ═══ SECTION 3: Additional Fees ═══ -->
              <div class="lf-section-card lf-section-fees">
                <div class="lf-section-hdr">
                  <span class="lf-section-icon">⚙️</span>
                  <span class="lf-section-title">Additional Fees</span>
                </div>
                <div class="lf-fee-cards">
                  <div class="lf-fee-card">
                    <label class="lf-fee-left">
                      <input type="checkbox" id="lf-toggle-amex" checked>
                      <span class="lf-fee-name">Amex Fee</span>
                    </label>
                    <div class="lf-fee-right">
                      <input type="number" class="lf-fee-input" id="lf-amex-input" value="3.5" min="0" step="0.1">
                      <span class="lf-fee-unit">%</span>
                    </div>
                    <span class="lf-fee-hidden-val" id="lf-amex-val" style="display:none">3.5</span>
                  </div>
                  <div class="lf-fee-card">
                    <label class="lf-fee-left">
                      <input type="checkbox" id="lf-toggle-fx" checked>
                      <span class="lf-fee-name">FX Fee</span>
                    </label>
                    <div class="lf-fee-right">
                      <input type="number" class="lf-fee-input" id="lf-fx-input" value="1.5" min="0" step="0.1">
                      <span class="lf-fee-unit">%</span>
                    </div>
                    <span class="lf-fee-hidden-val" id="lf-fx-val" style="display:none">1.5</span>
                  </div>
                  <div class="lf-fee-card">
                    <label class="lf-fee-left">
                      <input type="checkbox" id="lf-toggle-chargeback" checked>
                      <span class="lf-fee-name">Chargeback Fee</span>
                    </label>
                    <div class="lf-fee-right">
                      <span class="lf-fee-unit">£</span>
                      <input type="number" class="lf-fee-input" id="lf-chargeback-input" value="15" min="0" step="1">
                    </div>
                    <span class="lf-fee-hidden-val" id="lf-chargeback-val" style="display:none">15</span>
                  </div>
                  <div class="lf-fee-card">
                    <label class="lf-fee-left">
                      <input type="checkbox" id="lf-toggle-refund" checked>
                      <span class="lf-fee-name">Refund Fee</span>
                    </label>
                    <div class="lf-fee-right">
                      <span class="lf-fee-unit">£</span>
                      <input type="number" class="lf-fee-input" id="lf-refund-input" value="1" min="0" step="1">
                    </div>
                    <span class="lf-fee-hidden-val" id="lf-refund-val" style="display:none">1</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ═══ RIGHT COLUMN ═══ -->
            <div class="lf-output-right">

              <!-- ═══ SECTION 4: Risk Assessment ═══ -->
              <div class="lf-section-card lf-section-risk">
                <div class="lf-section-hdr">
                  <span class="lf-section-icon">🔍</span>
                  <span class="lf-section-title">Risk Assessment</span>
                </div>
                <div class="lf-risk-rows">
                  <div class="lf-rr"><span class="lf-rr-lbl">Risk Level</span>
                    <span class="lf-badge ${rBadge}">${r.riskLevel.toUpperCase()}</span></div>
                  <div class="lf-rr"><span class="lf-rr-lbl">Decision</span>
                    <span class="lf-badge ${dBadge}">${r.decision.toUpperCase()}</span></div>
                  <div style="border-top: 1px solid #e5e7eb; margin: 8px -20px 8px -20px; padding-top: 8px;">
                    <div class="lf-rr"><span class="lf-rr-lbl">Industry</span>
                      <span class="lf-rr-val">${this.lead.industry || "—"}</span></div>
                    <div class="lf-rr"><span class="lf-rr-lbl">Intl Transactions</span>
                      <span class="lf-rr-val">${this.lead.intlPercentage || 0}%</span></div>
                    <div class="lf-rr"><span class="lf-rr-lbl">Business Age</span>
                      <span class="lf-rr-val">${this.lead.businessAge || "—"}</span></div>
                    <div class="lf-rr"><span class="lf-rr-lbl">Delivery Time</span>
                      <span class="lf-rr-val">${this.lead.deliveryTime || "—"}</span></div>
                  </div>
                  <div style="border-top: 1px solid #e5e7eb; margin: 8px -20px 8px -20px; padding-top: 8px;">
                    <div class="lf-risk-reason">
                      <span class="lf-risk-reason-label">Why this risk?</span>
                      <span class="lf-risk-reason-text">
                        ${this._getRiskReasonText(r.riskLevel, this.lead)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ═══ SECTION 5: Actions ═══ -->
              <div class="lf-section-card lf-section-actions">
                <div class="lf-section-hdr">
                  <span class="lf-section-icon">🚀</span>
                  <span class="lf-section-title">Actions</span>
                </div>
                <div class="lf-action-stack">
                  <button class="lf-action-btn ${this.lead.quote_id ? "lf-action-done" : "lf-action-primary"}" id="lf-gen-quote" ${this.lead.processingRate && !this.lead.quote_id ? "" : "disabled"}>
                    ${this.lead.quote_id ? "✓ Quote Generated" : "📄 Generate Quote"}
                  </button>
                  <button class="lf-action-btn lf-action-secondary" id="lf-push-zoho" ${!this.lead.zohoPushed ? "" : "disabled"}>
                    ${this.lead.zohoPushed ? "✓ Pushed to Zoho" : "☁️ Push to Zoho"}
                  </button>
                  <button class="lf-action-btn ${isKYB ? "lf-action-done" : "lf-action-kyb"}" id="lf-mark-kyb"
                          ${isKYB ? "disabled" : ""}>
                    ${isKYB ? "✓ KYB Pending" : "🔐 Mark as KYB Ready"}
                  </button>
                </div>
              </div>
            </div>
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
        if (this.lead.processingRate && !this.lead.quote_id) {
          this._generateQuote();
        }
      });
      q("lf-ov-push-zoho")?.addEventListener("click", () => this._pushZoho());
      q("lf-ov-mark-kyb")?.addEventListener("click", () => this._markKYB());
      q("lf-send-quote-email")?.addEventListener("click", () => {
        const quoteUrl = `/quote.html?quote=${this.lead.quote_id}`;
        const subject = encodeURIComponent("Your MintedPay Quote");
        const body = encodeURIComponent(`View your quote:\n${quoteUrl}`);
        window.location.href = `mailto:${this.lead.email}?subject=${subject}&body=${body}`;
      });
      q("lf-copy-quote-link")?.addEventListener("click", () => {
        const quoteUrl = `${window.location.origin}/quote.html?quote=${this.lead.quote_id}`;
        navigator.clipboard.writeText(quoteUrl).then(() => {
          alert("Quote link copied to clipboard!");
        }).catch(() => {
          alert("Failed to copy. Please try again.");
        });
      });
      q("lf-ov-add-note")?.addEventListener("click", async () => {
        const input = q("lf-ov-note-input");
        if (!input || !input.value.trim()) return;
        try {
          await fetch(`/api/leads/${this.leadId}/notes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: input.value.trim() }),
          });
          // Refresh lead data and re-render
          const resp = await fetch(`/api/leads/${this.leadId}`);
          const updated = await resp.json();
          this.lead = updated;
          this._render();
        } catch (e) {
          alert("Could not add note. Please try again.");
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

      // Tab switching for Step 7
      this.overlay.querySelectorAll(".lf-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const tabName = e.target.dataset.tab;
          this.lead.volumeTab = tabName;
          this._scheduleSave();
          this._render();
        });
      });

      // Input autosave + qualification warnings for Step 1
      this.overlay.querySelectorAll(".lf-ctrl").forEach(el => {
        const evt = el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(evt, e => {
          this.lead[e.target.name] = e.target.value;
          if (e.target.name === "paymentTypes") this._updateConditional();

          // Show/hide qualification warnings on Step 1 country/industry change
          if (this.currentStep === 1 && (e.target.name === "country" || e.target.name === "industry")) {
            this._updateQualificationWarning();
          }

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

    // ── Update qualification warning banners for Step 1 ──────
    _updateQualificationWarning() {
      const oldWarning = this.overlay.querySelector(".lf-qual-warning");
      if (oldWarning) oldWarning.remove();

      if (this.currentStep !== 1) return;

      const check = window.RiskEngine.checkQualification(this.lead.country, this.lead.industryDetail || this.lead.industry);

      if (!check.allowed) {
        // RED banner: PROHIBITED
        const banner = document.createElement("div");
        banner.className = "lf-qual-warning lf-qual-prohibited";
        banner.innerHTML = `
          <span class="lf-qual-icon">🚫</span>
          <span class="lf-qual-text">This country/industry is prohibited. This lead cannot proceed.</span>
        `;
        const fieldsContainer = this.overlay.querySelector(".lf-fields");
        if (fieldsContainer) {
          fieldsContainer.parentElement.insertBefore(banner, fieldsContainer);
        }
      } else if (check.restricted) {
        // AMBER banner: RESTRICTED
        const banner = document.createElement("div");
        banner.className = "lf-qual-warning lf-qual-restricted";
        banner.innerHTML = `
          <span class="lf-qual-icon">⚠️</span>
          <span class="lf-qual-text">Warning: This country/industry is restricted. Additional review may be required.</span>
        `;
        const fieldsContainer = this.overlay.querySelector(".lf-fields");
        if (fieldsContainer) {
          fieldsContainer.parentElement.insertBefore(banner, fieldsContainer);
        }
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
      this.lead.csvLoading = true;
      this.lead.csvParseError = null;
      this._render();

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
            throw new Error("CSV must have at least a header row and one data row");
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

          this.lead.csvLoading = false;
          this.lead.csvParseError = null;
          await this._saveNow();
          this._render();
        } catch (err) {
          console.error("CSV parse error:", err);
          this.lead.csvLoading = false;
          this.lead.csvParseError = err.message || "Could not parse CSV file. Please check the format.";
          this._render();
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

    // ── Validation method for current step ────────────────────
    _validateStep() {
      const step = STEPS[this.currentStep - 1];
      if (!step) return true;

      // Step 1: businessName, country, industry required
      if (this.currentStep === 1) {
        if (!this.lead.businessName || !String(this.lead.businessName).trim()) {
          this._fieldError("lf-businessName", "Business Name is required");
          return false;
        }
        if (!this.lead.country || !String(this.lead.country).trim()) {
          this._fieldError("lf-country", "Country is required");
          return false;
        }
        // Validate country is in COUNTRIES list
        if (!COUNTRIES.includes(this.lead.country)) {
          this._fieldError("lf-country", "Please select a valid country from the list");
          return false;
        }
        if (!this.lead.industry || !String(this.lead.industry).trim()) {
          this._fieldError("lf-industry", "Industry is required");
          return false;
        }
      }

      // Step 4: intlPercentage, businessAge, deliveryTime required
      if (this.currentStep === 4) {
        if (this.lead.intlPercentage === undefined || this.lead.intlPercentage === null || this.lead.intlPercentage === "") {
          this._fieldError("lf-intlPercentage", "International transactions percentage is required");
          return false;
        }
        if (!this.lead.businessAge || !String(this.lead.businessAge).trim()) {
          this._fieldError("lf-businessAge", "Business Age is required");
          return false;
        }
        if (!this.lead.deliveryTime || !String(this.lead.deliveryTime).trim()) {
          this._fieldError("lf-deliveryTime", "Delivery Time is required");
          return false;
        }
      }

      // Step 7: monthlyVolume, avgTransactionValue required
      if (this.currentStep === 7) {
        if (!this.lead.monthlyVolume || parseFloat(this.lead.monthlyVolume) <= 0) {
          this._fieldError("lf-monthlyVolume", "Monthly Volume must be greater than 0");
          return false;
        }
        if (!this.lead.avgTransactionValue || parseFloat(this.lead.avgTransactionValue) <= 0) {
          this._fieldError("lf-avgTransactionValue", "Average Transaction Value must be greater than 0");
          return false;
        }
      }

      // Step 8: contactName, email required + format validation
      if (this.currentStep === 8) {
        if (!this.lead.contactName || !String(this.lead.contactName).trim()) {
          this._fieldError("lf-contactName", "Contact Name is required");
          return false;
        }
        if (!this.lead.email || !String(this.lead.email).trim()) {
          this._fieldError("lf-email", "Email is required");
          return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(this.lead.email)) {
          this._fieldError("lf-email", "Invalid email address format");
          return false;
        }
        // Validate website if filled
        if (this.lead.website && String(this.lead.website).trim()) {
          const website = this.lead.website.trim();
          if (!/^https?:\/\//.test(website)) {
            const testUrl = "https://" + website;
            if (!/^https?:\/\/[^\s@]+\.[^\s@]+$/.test(testUrl)) {
              this._fieldError("lf-website", "Invalid website URL format");
              return false;
            }
          }
        }
      }

      return true;
    }

    // ── Navigation: next (with validation + qualification check)
    async _next() {
      this._collectFields();

      // Validate current step
      if (!this._validateStep()) {
        return;
      }

      // Step 1 → qualification gate (after validation passes)
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
