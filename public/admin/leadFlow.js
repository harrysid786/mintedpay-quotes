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
        { name: "industry",     label: "Industry / Business Type", type: "industry-autocomplete", required: true, placeholder: "Type to search, e.g. E-commerce, SaaS, Retail…" },
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
        { name: "currentProvider",     label: "Current Payment Provider", type: "text", placeholder: "e.g. Stripe, Worldpay, PayPal, Adyen..." },
        { name: "currentMonthlyFees",  label: "Current Monthly Processing Fees (£) — optional", type: "number", placeholder: "e.g. 850", min: 0,
          hint: "If known, enter what the merchant pays per month. Used to calculate savings." },
        { name: "painPoints",          label: "Pain Points / Reason for Switching — optional", type: "textarea", placeholder: "What issues are they facing with their current provider?" },
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

      // ── Helpers ──────────────────────────────────────────
      const empty = (v) => v === undefined || v === null || v === "";
      const muted = `<span class="ov-empty">Not provided</span>`;
      const val   = (v, suffix = "") => empty(v) ? muted : `${String(v)}${suffix}`;

      const badge = (text, color = "gray") => {
        const cls = color === "green" ? "lf-badge-green" :
                    color === "red"   ? "lf-badge-red"   :
                    color === "amber" ? "lf-badge-amber"  :
                    color === "blue"  ? "bd-blue"         : "bd-grey";
        return `<span class="lf-badge ${cls}">${text}</span>`;
      };

      // ── Enum label formatters ─────────────────────────────
      const fmtBusinessAge = (v) => ({
        less_than_6: "Less than 6 months",
        "6_to_12":   "6–12 months",
        "1_to_2":    "1–2 years",
        "2_plus":    "2+ years",
      }[v] || v || null);

      const fmtDelivery = (v) => ({
        instant: "Instant / same-day",
        delayed: "Delayed (days / weeks)",
      }[v] || v || null);

      const fmtChannels = (v) => ({
        online: "Online only",
        retail: "Retail / In-person only",
        both:   "Both online & retail",
      }[v] || v || null);

      const fmtPaymentTypes = (v) => ({
        "one-off":      "One-off payments",
        subscription:   "Subscriptions / recurring",
        both:           "Both one-off & recurring",
      }[v] || v || null);

      const fmtPlatform = (v) => ({
        shopify:     "Shopify",
        woocommerce: "WooCommerce",
        magento:     "Magento / Adobe Commerce",
        bigcommerce: "BigCommerce",
        squarespace: "Squarespace",
        wix:         "Wix",
        custom:      "Custom built",
        none:        "None / Not applicable",
        other:       "Other",
      }[v] || v || null);

      const fmtCurrency = (n) => {
        const num = parseFloat(n);
        if (!num) return null;
        if (num >= 1_000_000) return "£" + (num / 1_000_000).toFixed(2) + "m";
        if (num >= 1_000)     return "£" + (num / 1_000).toFixed(1) + "k";
        return "£" + num.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };

      const fmtTs = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) +
               " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      };

      const fmtDate = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      };

      // ── Computed values ───────────────────────────────────
      const vol    = parseFloat(lead.monthlyVolume) || 0;
      const avgTx  = parseFloat(lead.avgTransactionValue) || 0;
      const txCnt  = vol > 0 && avgTx > 0 ? Math.round(vol / avgTx) : 0;
      const rate   = lead.processingRate || lead.pricing?.rate;
      const fee    = lead.fixedFee       || lead.pricing?.fixedFee;
      const hasPricing = !!(rate || fee);
      const hasQuote   = !!lead.quote_id;
      const isKYB      = lead.status === "kyb_pending";

      // Estimated monthly cost
      const estCost = (rate && fee && vol && txCnt)
        ? "£" + ((vol * rate / 100) + (txCnt * fee / 100)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : null;

      // Badges
      const statusColor = { qualified: "green", kyb_pending: "green", live: "green", quoted: "blue", rejected: "red", completed: "blue" };
      const statusCls   = statusColor[lead.status] || "gray";
      const statusLabel = (lead.status || "draft").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const riskColor   = lead.riskLevel === "low" ? "green" : lead.riskLevel === "medium" ? "amber" : lead.riskLevel === "high" ? "red" : "";
      const decColor    = lead.decision === "accept" ? "green" : lead.decision === "review" ? "amber" : lead.decision === "reject" ? "red" : "";

      // Activity
      const activity = Array.isArray(lead.activity) ? lead.activity : [];
      const activityLabels = {
        lead_created:   "Lead created",
        status_changed: "Status changed",
        note_added:     "Note added",
        kyb_submitted:  "KYB submitted",
        archived:       "Lead archived",
        reassigned:     "Lead reassigned",
        zoho_pushed:    "Pushed to Zoho",
        quote_generated:"Quote generated",
      };
      const activityIcons = {
        lead_created:    "🆕", status_changed: "🔄", note_added:      "📝",
        kyb_submitted:   "🔐", archived:       "📦", reassigned:      "👤",
        zoho_pushed:     "☁️", quote_generated: "📄",
      };
      const groupedActivity = [...activity].reverse().reduce((acc, a) => {
        const dk = fmtDate(a.timestamp);
        if (!acc[dk]) acc[dk] = [];
        acc[dk].push(a);
        return acc;
      }, {});

      const notes = Array.isArray(lead.notes) ? lead.notes : [];

      // ── Field row helper ──────────────────────────────────
      const row = (label, value, opts = {}) => {
        if (opts.hideEmpty && (value === null || value === undefined || value === "")) return "";
        const display = (value === null || value === undefined || value === "")
          ? muted
          : opts.html ? value : String(value);
        return `
          <div class="ov-field">
            <div class="ov-field-label">${label}</div>
            <div class="ov-field-value">${display}</div>
          </div>`;
      };

      // ── BUILD HTML ────────────────────────────────────────
      return `
        <div class="ov-page">

          <!-- ═══ STICKY TOPBAR ═══ -->
          <div class="ov-topbar">
            <button class="ov-back-btn" id="lf-overview-close">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Dashboard
            </button>
            <div class="ov-topbar-mid">
              <div class="ov-topbar-name">${lead.businessName || "Untitled Lead"}</div>
              <div class="ov-topbar-badges">
                ${lead.country ? `<span class="ov-country-chip">${lead.country}</span>` : ""}
                ${badge(statusLabel, statusCls)}
                ${riskColor ? badge((lead.riskLevel || "").toUpperCase() + " RISK", riskColor) : ""}
                ${decColor  ? badge((lead.decision  || "").toUpperCase(), decColor) : ""}
                ${lead.brand && lead.brand !== "minted" ? `<span class="db-brand-badge">${lead.brand.toUpperCase()}</span>` : ""}
              </div>
            </div>
            <div class="ov-topbar-actions">
              <button class="ov-hdr-btn ov-hdr-btn-ghost" id="lf-overview-edit">Edit Lead</button>
              <button class="ov-hdr-btn ov-hdr-btn-ghost" id="lf-overview-resume">Resume Flow</button>
            </div>
          </div>

          <!-- ═══ BODY ═══ -->
          <div class="ov-body">
            <div class="ov-layout">

              <!-- ══════ LEFT COLUMN ══════ -->
              <div class="ov-col-main">

                <!-- A. Pricing Summary Card (shown once, only if pricing exists) -->
                ${hasPricing ? `
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">💰</span>
                    Pricing Summary
                  </div>
                  <div class="ov-pricing-grid">
                    <div class="ov-pricing-cell ov-pricing-primary">
                      <div class="ov-pricing-label">Processing Rate</div>
                      <div class="ov-pricing-value">${rate}%</div>
                    </div>
                    <div class="ov-pricing-cell ov-pricing-primary">
                      <div class="ov-pricing-label">Fixed Fee</div>
                      <div class="ov-pricing-value">${fee}p</div>
                    </div>
                    ${riskColor ? `
                    <div class="ov-pricing-cell">
                      <div class="ov-pricing-label">Risk Level</div>
                      <div class="ov-pricing-value">${badge((lead.riskLevel || "").toUpperCase(), riskColor)}</div>
                    </div>` : ""}
                    ${decColor ? `
                    <div class="ov-pricing-cell">
                      <div class="ov-pricing-label">Decision</div>
                      <div class="ov-pricing-value">${badge((lead.decision || "").toUpperCase(), decColor)}</div>
                    </div>` : ""}
                    ${vol > 0 ? `
                    <div class="ov-pricing-cell">
                      <div class="ov-pricing-label">Monthly Volume</div>
                      <div class="ov-pricing-value ov-pricing-sm">${fmtCurrency(vol)}</div>
                    </div>` : ""}
                    ${estCost ? `
                    <div class="ov-pricing-cell">
                      <div class="ov-pricing-label">Est. Monthly Cost</div>
                      <div class="ov-pricing-value ov-pricing-sm">${estCost}</div>
                    </div>` : ""}
                  </div>
                  ${hasQuote ? `<div class="ov-quote-ref">Quote ID: <strong>${lead.quote_id}</strong></div>` : ""}
                </div>` : ""}

                <!-- B. Business Info Card -->
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">🏢</span>
                    Business Info
                  </div>
                  <div class="ov-card-body">
                    ${row("Business Name", lead.businessName)}
                    ${row("Industry", lead.industry
                        ? lead.industry + (lead.industryDetail ? ` <span class="ov-detail">(${lead.industryDetail})</span>` : "")
                        : "", { html: true })}
                    ${row("Country", lead.country)}
                    ${row("Sales Channels", fmtChannels(lead.salesChannels))}
                    ${row("Payment Types",  fmtPaymentTypes(lead.paymentTypes))}
                    ${row("Website", lead.website
                        ? `<a href="${lead.website}" target="_blank" rel="noopener">${lead.website}</a>`
                        : "", { html: true })}
                    ${row("Description", lead.description, { hideEmpty: true })}
                  </div>
                </div>

                <!-- C. Risk Signals Card -->
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">🔍</span>
                    Risk Signals
                  </div>
                  <div class="ov-card-body">
                    ${row("Intl Transactions",
                        !empty(lead.intlPercentage) ? lead.intlPercentage + "%" : "")}
                    ${row("Refund Rate",
                        !empty(lead.refundRate) ? lead.refundRate + "%" : "")}
                    ${row("Chargeback Rate",
                        !empty(lead.chargebackRate) ? lead.chargebackRate + "%" : "")}
                    ${row("Holds Customer Funds",
                        lead.holdsFunds === "yes"
                          ? badge("YES — holds funds", "amber")
                          : "No", { html: true })}
                    ${row("Business Age",    fmtBusinessAge(lead.businessAge))}
                    ${row("Delivery Time",   fmtDelivery(lead.deliveryTime))}
                  </div>
                </div>

                <!-- D. Volume & Setup Card -->
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">📊</span>
                    Volume & Setup
                  </div>
                  <div class="ov-card-body">
                    ${row("Monthly Volume",    vol   > 0 ? fmtCurrency(vol)   : "")}
                    ${row("Avg Transaction",   avgTx > 0 ? fmtCurrency(avgTx) : "")}
                    ${row("Est. Transactions", txCnt > 0 ? txCnt.toLocaleString("en-GB") + " / mo" : "", { hideEmpty: true })}
                    ${row("Current Provider",  lead.currentProvider)}
                    ${row("Current Monthly Fees", lead.currentMonthlyFees ? "£" + parseFloat(lead.currentMonthlyFees).toLocaleString("en-GB", {minimumFractionDigits:2,maximumFractionDigits:2}) : null, { hideEmpty: true })}
                    ${row("Platform",          fmtPlatform(lead.platform))}
                    ${row("Accounting",        lead.accountingSoftware, { hideEmpty: true })}
                    ${row("Integrations",      lead.integrations, { hideEmpty: true })}
                    ${row("Pain Points",       lead.painPoints, { hideEmpty: true })}
                  </div>
                </div>

                <!-- E. Contact Card -->
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">👤</span>
                    Contact
                  </div>
                  <div class="ov-card-body">
                    ${row("Name",   lead.contactName)}
                    ${row("Email",  lead.email
                        ? `<a href="mailto:${lead.email}">${lead.email}</a>`
                        : "", { html: true })}
                    ${row("Phone",  lead.phone,  { hideEmpty: true })}
                    ${row("Source", lead.leadSource, { hideEmpty: true })}
                  </div>
                </div>

              </div><!-- /ov-col-main -->

              <!-- ══════ RIGHT COLUMN ══════ -->
              <div class="ov-col-side">

                <!-- Actions Card -->
                <div class="ov-card ov-card-sticky">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">🚀</span>
                    Actions
                  </div>
                  <div class="ov-actions-list">
                    <button class="ov-act-btn ov-act-primary" id="lf-overview-quote"
                            ${hasPricing && !hasQuote ? "" : "disabled"}>
                      ${hasQuote ? "✓ Quote Generated" : "📄 Generate Quote"}
                    </button>
                    ${hasQuote ? `
                    <a class="ov-act-btn ov-act-link" href="/quote.html?quote=${lead.quote_id}&admin=1" target="_blank">
                      👁 View Quote (Admin)
                    </a>
                    <button class="ov-act-btn ov-act-secondary" id="lf-send-quote-email">
                      📧 Send to Merchant
                    </button>
                    <button class="ov-act-btn ov-act-secondary" id="lf-copy-quote-link">
                      📋 Copy Merchant Link
                    </button>
                    <button class="ov-act-btn ov-act-secondary" id="lf-download-quote-pdf">
                      ⬇️ Download PDF
                    </button>` : ""}
                    <div class="ov-act-divider"></div>
                    <button class="ov-act-btn ov-act-secondary" id="lf-ov-push-zoho"
                            ${!lead.zohoPushed ? "" : "disabled"}>
                      ${lead.zohoPushed ? "✓ Pushed to Zoho" : "☁️ Push to Zoho"}
                    </button>
                    <button class="ov-act-btn ${isKYB ? "ov-act-done" : "ov-act-kyb"}" id="lf-ov-mark-kyb"
                            ${isKYB ? "disabled" : ""}>
                      ${isKYB ? "✓ KYB Pending" : "🔐 Mark as KYB Ready"}
                    </button>
                  </div>
                  <div class="ov-meta-rows">
                    <div class="ov-meta-row">
                      <span class="ov-meta-label">Assigned to</span>
                      <span class="ov-meta-val">${empty(lead.assignedTo) ? "Unassigned" : lead.assignedTo}</span>
                    </div>
                    <div class="ov-meta-row">
                      <span class="ov-meta-label">Brand</span>
                      <span class="ov-meta-val">${lead.brand === "ummah" ? "Ummah Pay" : "Minted Pay"}</span>
                    </div>
                    <div class="ov-meta-row">
                      <span class="ov-meta-label">Zoho CRM</span>
                      <span class="ov-meta-val">${lead.zohoPushed ? badge("SYNCED", "green") : `<span class="ov-empty">Not synced</span>`}</span>
                    </div>
                    <div class="ov-meta-row">
                      <span class="ov-meta-label">Created</span>
                      <span class="ov-meta-val">${fmtDate(lead.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <!-- Activity Timeline -->
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">🕐</span>
                    Activity
                  </div>
                  <div class="ov-timeline">
                    ${activity.length === 0
                      ? `<div class="ov-tl-empty">No activity yet</div>`
                      : Object.entries(groupedActivity).map(([dateKey, events]) => `
                          <div class="ov-tl-group">
                            <div class="ov-tl-date">${dateKey}</div>
                            ${events.map(a => `
                              <div class="ov-tl-item">
                                <div class="ov-tl-dot"></div>
                                <div class="ov-tl-body">
                                  <div class="ov-tl-text">
                                    ${activityIcons[a.type] || "📌"}
                                    ${activityLabels[a.type] || a.type}
                                    ${a.oldStatus && a.newStatus ? `<span class="ov-tl-tag">${a.oldStatus} → ${a.newStatus}</span>` : ""}
                                    ${a.newAssignedTo ? `<span class="ov-tl-tag">→ ${a.newAssignedTo}</span>` : ""}
                                  </div>
                                  <div class="ov-tl-time">${fmtTs(a.timestamp)}</div>
                                </div>
                              </div>`).join("")}
                          </div>`).join("")}
                  </div>
                </div>

                <!-- Notes -->
                <div class="ov-card">
                  <div class="ov-card-hdr">
                    <span class="ov-card-icon">📝</span>
                    Notes
                    ${notes.length > 0 ? `<span class="ov-card-count">${notes.length}</span>` : ""}
                  </div>
                  <div class="ov-notes">
                    ${notes.length === 0
                      ? `<div class="ov-notes-empty">No notes yet</div>`
                      : [...notes].reverse().map(n => `
                          <div class="ov-note">
                            <div class="ov-note-text">${n.text}</div>
                            <div class="ov-note-time">${fmtTs(n.timestamp)}</div>
                          </div>`).join("")}
                    <div class="ov-note-add">
                      <textarea class="ov-note-input" id="lf-ov-note-input" placeholder="Add a note…" rows="2"></textarea>
                      <button class="ov-note-btn" id="lf-ov-add-note">Add Note</button>
                    </div>
                  </div>
                </div>

              </div><!-- /ov-col-side -->
            </div><!-- /ov-layout -->
          </div><!-- /ov-body -->
        </div><!-- /ov-page -->
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
      const hasError   = this.lead.csvParseError || false;
      const isLoading  = this.lead.csvLoading    || false;
      const hasResult  = !!(this.lead.monthlyVolume && this.lead.volumeTab === "csv" && !isLoading);
      const fileName   = this.lead.csvFileName   || "";

      return `
        <div class="lf-csv-wrap" id="lf-csv-upload-section">

          ${isLoading ? `
          <div class="lf-csv-loading">
            <div class="lf-spinner"></div>
            <p style="margin-top:10px;font-size:13px;color:var(--g3)">Parsing CSV file…</p>
          </div>` : `

          ${hasError ? `
          <div class="lf-csv-error-banner">
            <span>⚠️</span>
            <span>${this.lead.csvParseError}</span>
          </div>` : ""}

          ${hasResult ? `
          <div class="lf-csv-success-banner">
            <div class="lf-csv-success-top">
              <span class="lf-csv-success-icon">✓</span>
              <div class="lf-csv-success-body">
                <div class="lf-csv-success-title">
                  ${fileName || "Statement analysed"}
                  ${this.lead.csvTierLabel ? `<span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;margin-left:8px;vertical-align:middle">${this.lead.csvTierLabel}</span>` : ""}
                  ${this.lead.csvProcessor ? `<span style="display:inline-block;font-size:9px;font-weight:600;padding:2px 7px;border-radius:20px;background:var(--g6);color:var(--g3);margin-left:4px;vertical-align:middle">${this.lead.csvProcessor}</span>` : ""}
                </div>
                <div class="lf-csv-success-vals">
                  <span>Volume: <strong>£${parseFloat(this.lead.monthlyVolume).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}/mo</strong></span>
                  ${this.lead.transactionCount ? `<span>${Number(this.lead.transactionCount).toLocaleString("en-GB")} transactions</span>` : ""}
                  ${this.lead.avgTransactionValue ? `<span>Avg: <strong>£${parseFloat(this.lead.avgTransactionValue).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></span>` : ""}
                  ${this.lead.currentMonthlyFees ? `<span>Current fees: <strong>£${parseFloat(this.lead.currentMonthlyFees).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}/mo</strong></span>` : ""}
                  ${this.lead.csvCurrentRate ? `<span>Current rate: <strong style="color:${parseFloat(this.lead.csvCurrentRate)<1?"var(--green)":parseFloat(this.lead.csvCurrentRate)<2.2?"var(--amber)":"var(--red)"}">${parseFloat(this.lead.csvCurrentRate).toFixed(2)}%</strong></span>` : ""}
                  ${this.lead.csvDebitFrac ? `<span>${Math.round(parseFloat(this.lead.csvDebitFrac)*100)}% debit / ${Math.round((1-parseFloat(this.lead.csvDebitFrac))*100)}% credit</span>` : ""}
                  ${(() => {
                    const manual  = parseFloat(this.lead.intlPercentage);
                    const fromCsv = parseFloat(this.lead.csvIntlFrac);
                    const hasManual = Number.isFinite(manual) && manual >= 0 && manual <= 100;
                    const hasCsv    = Number.isFinite(fromCsv);
                    if (hasManual && hasCsv)
                      return `<span style="color:var(--brand)">Using ${manual}% international transactions <span style="font-weight:400;color:var(--g3)">(manual input)</span></span>`;
                    if (hasCsv)
                      return `<span style="color:var(--brand)">Detected ${Math.round(fromCsv*100)}% international transactions from your statement</span>`;
                    return "";
                  })()}
                </div>
              </div>
              <button class="lf-csv-clear-btn" id="lf-csv-clear">Replace</button>
            </div>
          </div>` : `

          <label class="lf-dropzone" id="lf-csv-dropzone" for="lf-csv-file-input">
            <span class="lf-dz-icon">📂</span>
            <span class="lf-dz-title">Drag & drop your statement here, or <u>click to browse</u></span>
            <span class="lf-dz-hint">Stripe · Worldpay · Barclaycard · any card processor export</span>
            <span class="lf-dz-hint" style="margin-top:2px;font-size:10px">Extracts: volume · fees · effective rate · card mix · debit fraction</span>
          </label>
          <input type="file" id="lf-csv-file-input" accept=".csv"
                 style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
          `}
          `}

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
      } else if (f.type === "industry-autocomplete") {
        // Industry typeahead — text input with filtered suggestions
        const cats = (window.RiskEngine?.INDUSTRY_CATEGORIES || []).map(c => c.label);
        const restricted = (window.RiskEngine?.RESTRICTED_INDUSTRIES || []);
        const prohibited = (window.RiskEngine?.PROHIBITED_INDUSTRIES || []);
        const valLower = val.toLowerCase();
        const isProhibited = prohibited.some(p => valLower && valLower.includes(p));
        const isRestricted = !isProhibited && restricted.some(r => valLower && valLower.includes(r));
        const warnClass = isProhibited ? "lf-industry-prohibited" : isRestricted ? "lf-industry-restricted" : "";
        ctrl = `
          <div class="lf-industry-wrap" id="lf-industry-wrap">
            <input class="lf-ctrl lf-industry-input ${warnClass}" id="lf-${f.name}" name="${f.name}"
                   type="text" value="${val}" placeholder="${f.placeholder || ""}"
                   autocomplete="off">
            ${isProhibited ? `<div class="lf-industry-status lf-industry-status-red">🚫 Prohibited industry — this lead cannot proceed</div>` :
              isRestricted ? `<div class="lf-industry-status lf-industry-status-amber">⚠️ Restricted industry — additional review required</div>` : ""}
            <div class="lf-industry-dropdown" id="lf-industry-dropdown" style="display:none">
              ${cats.map(c => {
                const cLower = c.toLowerCase();
                const iP = prohibited.some(p => cLower.includes(p));
                const iR = !iP && restricted.some(r => cLower.includes(r));
                const tag = iP ? `<span class="lf-industry-tag lf-tag-prohibited">Prohibited</span>` :
                            iR ? `<span class="lf-industry-tag lf-tag-restricted">Restricted</span>` : "";
                return `<div class="lf-industry-opt ${iP ? "lf-opt-prohibited" : iR ? "lf-opt-restricted" : ""}"
                             data-value="${c}">${c}${tag}</div>`;
              }).join("")}
            </div>
          </div>`;
      } else if (f.type === "datalist") {
        // Country typeahead — custom dropdown for reliable cross-browser filtering
        const prohibited = window.RiskEngine?.PROHIBITED_COUNTRIES || [];
        const restricted = window.RiskEngine?.RESTRICTED_COUNTRIES || [];
        const valLower   = val.toLowerCase();
        const isProhibited = prohibited.some(c => valLower && valLower.includes(c.toLowerCase()));
        const isRestricted = !isProhibited && restricted.some(c => valLower && c.toLowerCase() === valLower);
        const warnClass  = isProhibited ? "lf-industry-prohibited" : isRestricted ? "lf-industry-restricted" : "";
        ctrl = `
          <div class="lf-industry-wrap" id="lf-country-wrap">
            <input class="lf-ctrl lf-country-input ${warnClass}" id="lf-${f.name}" name="${f.name}"
                   type="text" value="${val}" placeholder="${f.placeholder || ""}"
                   autocomplete="off" aria-autocomplete="list">
            ${isProhibited ? `<div class="lf-industry-status lf-industry-status-red">🚫 We do not accept merchants from this country</div>` :
              isRestricted ? `<div class="lf-industry-status lf-industry-status-amber">⚠️ Higher-risk jurisdiction — additional review required</div>` : ""}
            <div class="lf-industry-dropdown" id="lf-country-dropdown" style="display:none">
              ${(f.options || []).map(country => {
                const cl = country.toLowerCase();
                const iP = prohibited.some(p => cl.includes(p.toLowerCase()));
                const iR = !iP && restricted.some(r => cl === r.toLowerCase());
                const tag = iP ? `<span class="lf-industry-tag lf-tag-prohibited">Prohibited</span>` :
                            iR ? `<span class="lf-industry-tag lf-tag-restricted">Restricted</span>` : "";
                return `<div class="lf-industry-opt ${iP ? "lf-opt-prohibited" : iR ? "lf-opt-restricted" : ""}"
                             data-value="${country}">${country}${tag}</div>`;
              }).join("")}
            </div>
          </div>`;
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
          ${f.hint ? `<div class="lf-field-hint-text">${f.hint}</div>` : ""}
        </div>
      `;
    }

    // ── Get risk reason explanation ────────────────────────
    _getRiskReasonText(riskLevel, lead) {
      const factors = [];
      const intl      = parseFloat(lead.intlPercentage) || 0;
      const cb        = parseFloat(lead.chargebackRate)  || 0;
      const refund    = parseFloat(lead.refundRate)      || 0;
      const ageEnum   = lead.businessAge || "";

      // International transactions
      if      (intl > 70) factors.push("High international volume (>70%)");
      else if (intl > 40) factors.push("Elevated international transactions");

      // Chargeback rate
      if      (cb > 2.0) factors.push("Critical chargeback rate (>2%)");
      else if (cb > 1.0) factors.push("Elevated chargeback rate (>1%)");
      else if (cb > 0.5) factors.push("Marginal chargeback rate (>0.5%)");

      // Refund rate
      if      (refund > 10) factors.push("High refund rate (>10%)");
      else if (refund >  5) factors.push("Moderate refund rate (>5%)");

      // Holds funds
      if (lead.holdsFunds === "yes") factors.push("Holds customer funds before disbursing");

      // Business age — use enum string labels, never parseFloat
      if      (ageEnum === "less_than_6") factors.push("Business is less than 6 months old");
      else if (ageEnum === "6_to_12")     factors.push("Business is 6–12 months old (early stage)");
      // "1_to_2" and "2_plus" → no risk factor added

      // Delivery time
      if (lead.deliveryTime === "delayed") factors.push("Delayed delivery model");

      // Subscription
      if (lead.paymentTypes === "subscription" || lead.paymentTypes === "both") {
        factors.push("Subscription / recurring billing");
      }

      if (factors.length === 0) {
        // Provide a positive confirmation when no risk factors found
        const ageLabel = ageEnum === "2_plus"  ? "Established business (2+ years), "
                       : ageEnum === "1_to_2"  ? "Established business (1–2 years), "
                       : "";
        return ageLabel + "low-risk profile based on submitted data.";
      }

      return factors.slice(0, 4).join(" · ");
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

      const p      = this.pricingResult;
      const r      = this.riskResult || { riskLevel: "low", decision: "accept" };
      const vol    = parseFloat(this.lead.monthlyVolume)       || 0;
      const avgTx  = parseFloat(this.lead.avgTransactionValue) || 0;
      const txCnt  = avgTx > 0 ? Math.round(vol / avgTx) : (vol > 0 ? Math.round(vol / 55) : 0);
      const isKYB  = this.lead.status === "kyb_pending";

      // Enforce fixed fee floor
      if (p.fixed_fee < 10) p.fixed_fee = 10;

      // ── Current fee data — all sources ───────────────────────────────────
      const rawFeeManual   = parseFloat(this.lead.currentMonthlyFees)           || 0;
      const rawFeePricing  = parseFloat(this.lead.pricing?.currentMonthlyFees)  || 0;
      const csvCurRate     = parseFloat(this.lead.csvCurrentRate)               || 0;

      let curFeesRaw = 0;
      if (rawFeeManual > 0)                    curFeesRaw = rawFeeManual;
      else if (rawFeePricing > 0)              curFeesRaw = rawFeePricing;
      else if (csvCurRate > 0 && vol > 0)      curFeesRaw = (csvCurRate / 100) * vol;

      // Derive current effective rate
      let curRate = null;
      if (curFeesRaw > 0 && vol > 0) {
        curRate = Math.round((curFeesRaw / vol * 100) * 100) / 100;
        p.current_rate = curRate;
      } else if (csvCurRate > 0) {
        curRate = Math.round(csvCurRate * 100) / 100;
        p.current_rate = curRate;
      } else if (p.current_rate && p.current_rate > 0) {
        curRate = parseFloat(p.current_rate);
      }

      const curPaying = curFeesRaw > 0 ? curFeesRaw
                      : (curRate && vol > 0 ? (curRate / 100) * vol : null);

      // Store sim state on pricingResult for re-renders
      const simRate  = p._simRate  !== undefined ? p._simRate  : p.rate;
      const simFixed = p._simFixed !== undefined ? p._simFixed : p.fixed_fee;

      // Cost calculations using simulator values
      const simRev        = vol > 0 ? ((vol * simRate / 100) + (txCnt * simFixed / 100)) : 0;
      const effectiveRate = vol > 0 ? ((simRev / vol) * 100).toFixed(2) : null;
      const estMrg        = Math.max(0, simRate - 0.46).toFixed(2);
      const mSave         = curPaying !== null ? Math.max(0, curPaying - simRev) : 0;

      // Risk badges
      const rBadge = r.riskLevel === "low" ? "lf-badge-green" : r.riskLevel === "medium" ? "lf-badge-amber" : "lf-badge-red";
      const dBadge = r.decision  === "accept" ? "lf-badge-green" : r.decision === "review" ? "lf-badge-amber" : "lf-badge-red";

      // Confidence
      const dataPoints = [vol > 0, avgTx > 0, !!r.riskLevel, !!this.lead.country, !!this.lead.industry].filter(Boolean).length;
      const confidence = dataPoints >= 4 ? "HIGH" : dataPoints >= 2 ? "MEDIUM" : "LOW";
      const confCls    = confidence === "HIGH" ? "lf-conf-high" : confidence === "MEDIUM" ? "lf-conf-med" : "lf-conf-low";

      // Merchant tier
      let tierLabel = "", tierColor = "var(--g3)", tierBg = "var(--g6)";
      if      (vol >= 200000) { tierLabel = "Large Merchant";  tierColor = "#059669"; tierBg = "#ecfdf5"; }
      else if (vol >= 50000)  { tierLabel = "Medium Merchant"; tierColor = "#2563eb"; tierBg = "#eff6ff"; }
      else if (vol > 0)       { tierLabel = "Small Merchant";  tierColor = "#94a3b8"; tierBg = "#f8fafc"; }

      // Simulator zone colour
      const minRate  = 0.76, maxRate  = 4.0;
      const minFixed = 10,   maxFixed = 50;
      const rPct     = Math.round(((simRate  - minRate)  / (maxRate  - minRate))  * 100);
      const fPct     = Math.round(((simFixed - minFixed) / (maxFixed - minFixed)) * 100);
      const rZone    = simRate < 1.5 ? "var(--green)" : simRate < 2.5 ? "var(--amber)" : "var(--red)";

      const fmt2 = (n) => "£" + Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtK = (n) => { const a = Math.abs(n); if (a >= 1e6) return "£" + (a / 1e6).toFixed(2) + "m"; if (a >= 1e3) return "£" + (a / 1e3).toFixed(1) + "k"; return "£" + a.toFixed(2); };

      return `
        <div class="lf-output-page">

          <!-- ══ HEADER ══ -->
          <div class="lf-op-head">
            <div>
              <h2 class="lf-op-title">${this.lead.businessName || "Pricing Output"}</h2>
              <div class="lf-op-sub">
                ${this.lead.country ? `<span>${this.lead.country}</span>` : ""}
                ${this.lead.industry ? `<span>${this.lead.industry}</span>` : ""}
                ${tierLabel ? `<span class="lf-op-tier" style="color:${tierColor};background:${tierBg}">${tierLabel}</span>` : ""}
                <span class="lf-conf-badge ${confCls}">Confidence: ${confidence}</span>
              </div>
            </div>
            <div class="lf-op-head-badges">
              <span class="lf-badge ${rBadge}">${r.riskLevel.toUpperCase()} RISK</span>
              <span class="lf-badge ${dBadge}">${r.decision.toUpperCase()}</span>
            </div>
          </div>

          <!-- ══ A: CUSTOMER OVERVIEW ══ -->
          <div class="lf-op-section">
            <div class="lf-op-section-title">Customer Overview</div>
            <div class="lf-op-metrics">
              <div class="lf-op-metric">
                <div class="lf-op-metric-lbl">Monthly Volume</div>
                <div class="lf-op-metric-val">${vol > 0 ? fmtK(vol) : "—"}</div>
              </div>
              <div class="lf-op-metric">
                <div class="lf-op-metric-lbl">Transactions / mo</div>
                <div class="lf-op-metric-val">${txCnt > 0 ? txCnt.toLocaleString("en-GB") : "—"}</div>
              </div>
              <div class="lf-op-metric">
                <div class="lf-op-metric-lbl">Avg Transaction</div>
                <div class="lf-op-metric-val">${avgTx > 0 ? fmt2(avgTx) : "—"}</div>
              </div>
              <div class="lf-op-metric">
                <div class="lf-op-metric-lbl">Current Effective Rate</div>
                <div class="lf-op-metric-val" style="color:${curRate !== null ? (curRate < 1 ? "var(--green)" : curRate < 2.2 ? "var(--amber)" : "var(--red)") : "var(--g4)"}">
                  ${curRate !== null ? curRate.toFixed(2) + "%" : "—"}
                </div>
              </div>
            </div>

            <!-- Rate comparison (mirrors quote.html) -->
            <div class="lf-op-rate-compare">
              ${curRate !== null ? `
              <div class="lf-op-rate-block lf-op-rate-current">
                <div class="lf-op-rate-lbl">Currently paying</div>
                <div class="lf-op-rate-big" style="color:var(--red)">${curRate.toFixed(2)}<span class="lf-op-rate-pct">%</span></div>
                <div class="lf-op-rate-sub">effective rate on submitted data</div>
              </div>
              <div class="lf-op-rate-arrow">→</div>` : ""}
              <div class="lf-op-rate-block lf-op-rate-mp${curRate === null ? " lf-op-rate-solo" : ""}">
                <div class="lf-op-rate-lbl">MintedPay rate</div>
                <div class="lf-op-rate-big" style="color:var(--brand)">${simRate.toFixed(2)}<span class="lf-op-rate-pct">%</span></div>
                <div class="lf-op-rate-sub">+ <strong>${simFixed}p</strong> fixed fee per transaction</div>
              </div>
            </div>

            ${mSave > 0 ? `
            <div class="lf-op-save-banner">
              <span class="lf-op-save-lbl">Estimated Monthly Saving</span>
              <div class="lf-op-save-vals">
                <strong>${fmt2(mSave)} / month</strong>
                <strong>${fmt2(mSave * 12)} / year</strong>
              </div>
            </div>` : ""}
          </div>

          <!-- ══ B: PAYMENT ANALYTICS ══ -->
          <div class="lf-op-section">
            <div class="lf-op-section-title">Payment Analytics</div>
            <div class="lf-op-analytics-grid">
              <div class="lf-op-analytic">
                <div class="lf-op-analytic-lbl">Est. Monthly Processing Cost</div>
                <div class="lf-op-analytic-val">${simRev > 0 ? fmt2(simRev) : "—"}</div>
                <div class="lf-op-analytic-sub">at ${simRate}% + ${simFixed}p/tx</div>
              </div>
              <div class="lf-op-analytic">
                <div class="lf-op-analytic-lbl">Effective Rate</div>
                <div class="lf-op-analytic-val">${effectiveRate !== null ? effectiveRate + "%" : "—"}</div>
                <div class="lf-op-analytic-sub">all-in blended rate</div>
              </div>
              <div class="lf-op-analytic">
                <div class="lf-op-analytic-lbl">Est. Gross Margin</div>
                <div class="lf-op-analytic-val">~${estMrg}%</div>
                <div class="lf-op-analytic-sub">above cost (0.46% base)</div>
              </div>
              <div class="lf-op-analytic">
                <div class="lf-op-analytic-lbl">Intl Transactions</div>
                <div class="lf-op-analytic-val">${this.lead.intlPercentage !== undefined && this.lead.intlPercentage !== "" ? this.lead.intlPercentage + "%" : "—"}</div>
                <div class="lf-op-analytic-sub">of volume</div>
              </div>
              <div class="lf-op-analytic">
                <div class="lf-op-analytic-lbl">Chargeback Rate</div>
                <div class="lf-op-analytic-val" style="color:${parseFloat(this.lead.chargebackRate) > 1 ? "var(--red)" : "var(--green)"}">
                  ${this.lead.chargebackRate ? this.lead.chargebackRate + "%" : "—"}
                </div>
                <div class="lf-op-analytic-sub">${parseFloat(this.lead.chargebackRate) > 1 ? "⚠️ elevated" : "within threshold"}</div>
              </div>
              <div class="lf-op-analytic">
                <div class="lf-op-analytic-lbl">Risk Level</div>
                <div class="lf-op-analytic-val">
                  <span class="lf-badge ${rBadge}" style="font-size:13px">${r.riskLevel.toUpperCase()}</span>
                </div>
                <div class="lf-op-analytic-sub">${this._getRiskReasonText(r.riskLevel, this.lead)}</div>
              </div>
            </div>

            <!-- Additional fees summary -->
            <div class="lf-op-fees-row">
              <div class="lf-op-fee-chip" id="lf-chip-amex">
                <input type="checkbox" id="lf-toggle-amex" checked>
                <label for="lf-toggle-amex">Amex</label>
                <input type="number" class="lf-op-fee-inp" id="lf-amex-input" value="3.5" min="0" step="0.1">
                <span>%</span>
              </div>
              <div class="lf-op-fee-chip">
                <input type="checkbox" id="lf-toggle-fx" checked>
                <label for="lf-toggle-fx">FX / Intl</label>
                <input type="number" class="lf-op-fee-inp" id="lf-fx-input" value="1.5" min="0" step="0.1">
                <span>%</span>
              </div>
              <div class="lf-op-fee-chip">
                <input type="checkbox" id="lf-toggle-chargeback" checked>
                <label for="lf-toggle-chargeback">Chargeback</label>
                <span>£</span>
                <input type="number" class="lf-op-fee-inp" id="lf-chargeback-input" value="15" min="0" step="1">
              </div>
              <div class="lf-op-fee-chip">
                <input type="checkbox" id="lf-toggle-refund" checked>
                <label for="lf-toggle-refund">Refund</label>
                <span>£</span>
                <input type="number" class="lf-op-fee-inp" id="lf-refund-input" value="1" min="0" step="1">
              </div>
            </div>
          </div>

          <!-- ══ C: RATE SIMULATOR ══ -->
          <div class="lf-op-section">
            <div class="lf-op-section-title">Rate Simulator</div>
            <div class="lf-op-sim">
              <div class="lf-op-sim-top">
                <div class="lf-op-sim-ctrl">
                  <div class="lf-op-sim-ctrl-lbl">Processing Rate</div>
                  <div class="lf-op-sim-spin-wrap lf-op-sim-spin-brand">
                    <button class="lf-op-sim-btn" id="lf-sim-rate-up">▲</button>
                    <input type="number" class="lf-op-sim-box" id="lf-sim-rate"
                           value="${simRate}" min="${minRate}" max="${maxRate}" step="0.01">
                    <button class="lf-op-sim-btn" id="lf-sim-rate-dn">▼</button>
                  </div>
                  <span class="lf-op-sim-pct">%</span>
                </div>
                <div class="lf-op-sim-sep">+</div>
                <div class="lf-op-sim-ctrl">
                  <div class="lf-op-sim-ctrl-lbl">Fixed Fee</div>
                  <div class="lf-op-sim-spin-wrap lf-op-sim-spin-green">
                    <button class="lf-op-sim-btn" id="lf-sim-fixed-up">▲</button>
                    <input type="number" class="lf-op-sim-box lf-op-sim-box-green" id="lf-sim-fixed"
                           value="${simFixed}" min="${minFixed}" max="${maxFixed}" step="1">
                    <button class="lf-op-sim-btn" id="lf-sim-fixed-dn">▼</button>
                  </div>
                  <span class="lf-op-sim-pct" style="color:var(--green)">p</span>
                </div>
              </div>

              <!-- Rate zone slider -->
              <div class="lf-op-sim-track-wrap">
                <div class="lf-op-sim-track-bg"></div>
                <input type="range" class="lf-op-sim-range" id="lf-sim-rate-range"
                       min="${minRate}" max="${maxRate}" step="0.01" value="${simRate}">
                <div class="lf-op-sim-ticks">
                  <span style="color:var(--green)">▼ Floor</span>
                  <span style="color:var(--amber);text-align:center">Market</span>
                  <span style="color:var(--red);text-align:right">Premium ▲</span>
                </div>
              </div>

              <!-- Simulator output strip -->
              <div class="lf-op-sim-strip">
                <div class="lf-op-sim-cell">
                  <div class="lf-op-sim-cell-lbl">Monthly Cost</div>
                  <div class="lf-op-sim-cell-val" id="lf-sim-out-cost">${vol > 0 ? fmt2(simRev) : "—"}</div>
                </div>
                <div class="lf-op-sim-cell">
                  <div class="lf-op-sim-cell-lbl">Effective Rate</div>
                  <div class="lf-op-sim-cell-val" id="lf-sim-out-eff">${effectiveRate !== null ? effectiveRate + "%" : "—"}</div>
                </div>
                <div class="lf-op-sim-cell">
                  <div class="lf-op-sim-cell-lbl">Est. Margin</div>
                  <div class="lf-op-sim-cell-val" id="lf-sim-out-mrg">~${estMrg}%</div>
                </div>
                <div class="lf-op-sim-cell">
                  <div class="lf-op-sim-cell-lbl">Monthly Saving</div>
                  <div class="lf-op-sim-cell-val" id="lf-sim-out-save" style="color:${mSave > 0 ? "var(--green)" : "var(--g3)"}">
                    ${mSave > 0 ? fmt2(mSave) : "—"}
                  </div>
                </div>
              </div>

              <div class="lf-op-sim-actions">
                <button class="lf-op-sim-apply" id="lf-apply-override">✓ Apply This Rate to Quote</button>
                <button class="lf-op-sim-reset" id="lf-sim-reset">↺ Reset to System Rate</button>
              </div>
            </div>
          </div>

          <!-- ══ D: QUOTE PREVIEW ══ -->
          <div class="lf-op-section">
            <div class="lf-op-section-title" style="display:flex;align-items:center;justify-content:space-between">
              Quote Preview
              ${this.lead.quote_id ? `<span style="font-size:11px;font-weight:600;color:var(--g3)">ID: ${this.lead.quote_id}</span>` : ""}
            </div>

            <!-- Quote header (mirrors qp-hdr) -->
            <div class="lf-op-qp-hdr">
              <div>
                <div class="lf-op-qp-brand">Minted<em>Pay</em></div>
                <div style="font-size:10px;color:var(--g3)">Payment Processing Proposal</div>
              </div>
              <div style="text-align:right;font-size:11px;color:var(--g3)">
                <strong style="color:var(--black)">${this.lead.businessName || this.lead.contactName || "—"}</strong><br>
                ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}<br>
                Valid for 30 days
              </div>
            </div>

            <!-- Snapshot (mirrors qp-snapshot) -->
            ${vol > 0 ? `
            <div class="lf-op-snapshot">
              <div class="lf-op-snap-cell"><div class="lf-op-snap-lbl">Volume Analysed</div><div class="lf-op-snap-val">${fmtK(vol)}</div></div>
              <div class="lf-op-snap-cell"><div class="lf-op-snap-lbl">Transactions</div><div class="lf-op-snap-val">${txCnt > 0 ? txCnt.toLocaleString("en-GB") : "—"}</div></div>
              <div class="lf-op-snap-cell"><div class="lf-op-snap-lbl">Avg Transaction</div><div class="lf-op-snap-val">${avgTx > 0 ? fmt2(avgTx) : "—"}</div></div>
              <div class="lf-op-snap-cell"><div class="lf-op-snap-lbl">Current Rate</div><div class="lf-op-snap-val" style="color:${curRate !== null ? (curRate < 1 ? "var(--green)" : curRate < 2.2 ? "var(--amber)" : "var(--red)") : "var(--g4)"}">${curRate !== null ? curRate.toFixed(2) + "%" : "—"}</div></div>
            </div>` : ""}

            <!-- Pricing table -->
            <div class="lf-op-ptable-wrap">
              <table class="lf-op-ptable">
                <thead><tr><th>Transaction Type</th><th>Rate</th><th>Notes</th></tr></thead>
                <tbody>
                  <tr>
                    <td>All Cards (Blended)</td>
                    <td class="lf-op-ptable-rate">${simRate.toFixed(2)}% + ${simFixed}p per transaction</td>
                    <td class="lf-op-ptable-note">Single blended rate, Visa &amp; Mastercard debit and credit</td>
                  </tr>
                  <tr id="lf-qp-amex-row">
                    <td>American Express</td>
                    <td class="lf-op-ptable-rate" style="color:var(--red)" id="lf-qp-amex-val">3.50% + 20p per transaction</td>
                    <td class="lf-op-ptable-note">Applied to all Amex transactions</td>
                  </tr>
                  <tr id="lf-qp-fx-row">
                    <td>International / FX</td>
                    <td class="lf-op-ptable-rate" id="lf-qp-fx-val">1.50%</td>
                    <td class="lf-op-ptable-note">Applied when card currency differs from settlement</td>
                  </tr>
                  <tr id="lf-qp-cb-row">
                    <td>Chargebacks</td>
                    <td class="lf-op-ptable-rate" style="color:var(--red)" id="lf-qp-cb-val">£15.00 per chargeback</td>
                    <td class="lf-op-ptable-note">Fee applied when a dispute is received</td>
                  </tr>
                  <tr id="lf-qp-ref-row">
                    <td>Refunds</td>
                    <td class="lf-op-ptable-rate" id="lf-qp-ref-val">£1.00 per refund</td>
                    <td class="lf-op-ptable-note">Fee applied when processing refunds</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- ══ E: ADMIN ACTIONS ══ -->
          <div class="lf-op-section lf-op-actions-section">
            <div class="lf-op-section-title">Admin Actions</div>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--g6)">
              <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--g3);white-space:nowrap">Pricing Profile</label>
              <select id="lf-pricing-profile" style="border:1px solid var(--g5);border-radius:var(--r);padding:6px 10px;font-size:12px;font-family:'Inter',sans-serif;background:var(--white);color:var(--black);cursor:pointer;outline:none">
                <option value="aggressive" ${(this.lead.pricingProfile || "standard") === "aggressive" ? "selected" : ""}>Aggressive</option>
                <option value="standard"   ${(this.lead.pricingProfile || "standard") === "standard"   ? "selected" : ""}>Standard</option>
                <option value="conservative" ${(this.lead.pricingProfile || "standard") === "conservative" ? "selected" : ""}>Conservative</option>
              </select>
              <span style="font-size:10px;color:var(--g3)">Changes pricing on recalculate</span>
            </div>
            <div class="lf-op-action-row">
              <button class="lf-op-act-btn lf-op-act-primary" id="lf-gen-quote"
                      ${this.pricingResult && !this.quoteGenerated ? "" : "disabled"}>
                ${this.lead.quote_id ? "✓ Quote Generated" : "📄 Generate Quote Link"}
              </button>
              <button class="lf-op-act-btn lf-op-act-secondary" id="lf-push-zoho"
                      ${!this.lead.zohoPushed ? "" : "disabled"}>
                ${this.lead.zohoPushed ? "✓ Pushed to Zoho" : "☁️ Push to Zoho"}
              </button>
              <button class="lf-op-act-btn ${isKYB ? "lf-op-act-done" : "lf-op-act-kyb"}" id="lf-mark-kyb"
                      ${isKYB ? "disabled" : ""}>
                ${isKYB ? "✓ KYB Pending" : "🔐 Mark KYB Ready"}
              </button>
            </div>
            ${this.lead.quote_id ? `
            <div class="lf-op-quote-notice">
              ✓ Quote <strong>${this.lead.quote_id}</strong> generated.
              <a href="/quote.html?quote=${this.lead.quote_id}&admin=1" target="_blank">View (Admin) →</a>
              &nbsp;·&nbsp;
              <a href="/quote.html?quote=${this.lead.quote_id}" target="_blank">View (Merchant) →</a>
            </div>` : ""}
            ${isKYB ? `
            <div class="lf-op-kyb-notice">
              🔐 This lead is marked KYB Ready and added to the onboarding pipeline.
            </div>` : ""}
          </div>

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
        const merchantUrl = `${window.location.origin}/quote.html?quote=${this.lead.quote_id}`;
        const brand = this.lead.brand === "ummah" ? "Ummah Pay" : "MintedPay";
        const subject = encodeURIComponent(`Your ${brand} Payment Processing Quote`);
        const body = encodeURIComponent(`Dear ${this.lead.contactName || ""},\n\nPlease find your payment processing quote below:\n\n${merchantUrl}\n\nThis quote is valid for 30 days.\n\nKind regards,\n${brand} Team`);
        window.open(`mailto:${this.lead.email}?subject=${subject}&body=${body}`, "_self");
      });
      q("lf-copy-quote-link")?.addEventListener("click", () => {
        const merchantUrl = `${window.location.origin}/quote.html?quote=${this.lead.quote_id}`;
        navigator.clipboard.writeText(merchantUrl).then(() => {
          const btn = q("lf-copy-quote-link");
          if (btn) { btn.textContent = "✓ Copied!"; setTimeout(() => { btn.textContent = "📋 Copy Merchant Link"; }, 2000); }
        }).catch(() => alert("Failed to copy. Please try again."));
      });
      q("lf-download-quote-pdf")?.addEventListener("click", () => {
        // Open the admin PDF view — the quote.html page handles PDF export
        window.open(`/quote.html?quote=${this.lead.quote_id}&admin=1&autoprint=1`, "_blank");
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

      // ── Pricing profile selector ───────────────────────────
      q("lf-pricing-profile")?.addEventListener("change", (e) => {
        this.lead.pricingProfile = e.target.value;
        // Clear cached result so Step 10 recalculates with the new profile
        this.pricingResult = null;
        this._scheduleSave();
        this._render();
      });

      // ── Rate Simulator live updates ────────────────────────
      const simRateEl  = q("lf-sim-rate");
      const simFixedEl = q("lf-sim-fixed");
      const simRange   = q("lf-sim-rate-range");

      const updateSimOutputs = () => {
        const sr = parseFloat(simRateEl?.value) || this.pricingResult.rate;
        const sf = parseFloat(simFixedEl?.value) || this.pricingResult.fixed_fee;
        const vol    = parseFloat(this.lead.monthlyVolume) || 0;
        const avgTx  = parseFloat(this.lead.avgTransactionValue) || 55;
        const txCnt  = avgTx > 0 ? Math.round(vol / avgTx) : 0;
        const rev    = vol > 0 ? ((vol * sr / 100) + (txCnt * sf / 100)) : 0;
        const effR   = vol > 0 ? ((rev / vol) * 100).toFixed(2) + "%" : "—";
        const mrg    = Math.max(0, sr - 0.46).toFixed(2);
        const rawFeeManual  = parseFloat(this.lead.currentMonthlyFees)          || 0;
        const rawFeePricing = parseFloat(this.lead.pricing?.currentMonthlyFees) || 0;
        const csvCurRateSim = parseFloat(this.lead.csvCurrentRate)              || 0;
        let simCurFees = 0;
        if (rawFeeManual > 0)               simCurFees = rawFeeManual;
        else if (rawFeePricing > 0)         simCurFees = rawFeePricing;
        else if (csvCurRateSim > 0 && vol > 0) simCurFees = (csvCurRateSim / 100) * vol;
        const curRate = this.pricingResult.current_rate || (simCurFees > 0 && vol > 0 ? (simCurFees / vol * 100) : null);
        const curPay  = simCurFees > 0 ? simCurFees : (curRate && vol > 0 ? (curRate / 100) * vol : null);
        const save    = curPay !== null ? Math.max(0, curPay - rev) : 0;

        const fmt2 = (n) => "£" + Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (q("lf-sim-out-cost"))  q("lf-sim-out-cost").textContent  = vol > 0 ? fmt2(rev)  : "—";
        if (q("lf-sim-out-eff"))   q("lf-sim-out-eff").textContent   = effR;
        if (q("lf-sim-out-mrg"))   q("lf-sim-out-mrg").textContent   = "~" + mrg + "%";
        if (q("lf-sim-out-save")) {
          q("lf-sim-out-save").textContent  = save > 0 ? fmt2(save) : "—";
          q("lf-sim-out-save").style.color  = save > 0 ? "var(--green)" : "var(--g3)";
        }
        // Keep range in sync with number input
        if (simRange) simRange.value = sr;

        // Update quote preview rate
        const ptRow = document.querySelector(".lf-op-ptable tbody tr:first-child td:nth-child(2)");
        if (ptRow) ptRow.textContent = sr.toFixed(2) + "% + " + sf + "p per transaction";

        // Update rate comparison block
        const mpBig = document.querySelector(".lf-op-rate-mp .lf-op-rate-big");
        if (mpBig) mpBig.innerHTML = sr.toFixed(2) + '<span class="lf-op-rate-pct">%</span>';
        const mpSub = document.querySelector(".lf-op-rate-mp .lf-op-rate-sub");
        if (mpSub) mpSub.innerHTML = '+ <strong>' + sf + 'p</strong> fixed fee per transaction';

        // Store sim state so re-renders preserve it
        this.pricingResult._simRate  = sr;
        this.pricingResult._simFixed = sf;
      };

      if (simRateEl) {
        simRateEl.addEventListener("input", updateSimOutputs);
        q("lf-sim-rate-up")?.addEventListener("click", () => {
          simRateEl.value = Math.min(4.0, (parseFloat(simRateEl.value) || 0) + 0.01).toFixed(2);
          updateSimOutputs();
        });
        q("lf-sim-rate-dn")?.addEventListener("click", () => {
          simRateEl.value = Math.max(0.76, (parseFloat(simRateEl.value) || 0) - 0.01).toFixed(2);
          updateSimOutputs();
        });
      }
      if (simFixedEl) {
        simFixedEl.addEventListener("input", updateSimOutputs);
        q("lf-sim-fixed-up")?.addEventListener("click", () => {
          simFixedEl.value = Math.min(50, (parseInt(simFixedEl.value) || 10) + 1);
          updateSimOutputs();
        });
        q("lf-sim-fixed-dn")?.addEventListener("click", () => {
          simFixedEl.value = Math.max(10, (parseInt(simFixedEl.value) || 10) - 1);
          updateSimOutputs();
        });
      }
      if (simRange) {
        simRange.addEventListener("input", () => {
          if (simRateEl) simRateEl.value = parseFloat(simRange.value).toFixed(2);
          updateSimOutputs();
        });
      }
      q("lf-sim-reset")?.addEventListener("click", () => {
        if (simRateEl)  simRateEl.value  = this.pricingResult.rate;
        if (simFixedEl) simFixedEl.value = this.pricingResult.fixed_fee;
        if (simRange)   simRange.value   = this.pricingResult.rate;
        this.pricingResult._simRate  = undefined;
        this.pricingResult._simFixed = undefined;
        updateSimOutputs();
      });

      // ── Fee toggles + optional fee row visibility ──────────
      const updateFeeRows = () => {
        const amexOn = q("lf-toggle-amex")?.checked;
        const fxOn   = q("lf-toggle-fx")?.checked;
        const cbOn   = q("lf-toggle-chargeback")?.checked;
        const refOn  = q("lf-toggle-refund")?.checked;
        const amexPct = parseFloat(q("lf-amex-input")?.value) || 3.5;
        const fxPct   = parseFloat(q("lf-fx-input")?.value)   || 1.5;
        const cbAmt   = parseFloat(q("lf-chargeback-input")?.value) || 15;
        const refAmt  = parseFloat(q("lf-refund-input")?.value)     || 1;

        const amexRow = q("lf-qp-amex-row"), fxRow = q("lf-qp-fx-row"),
              cbRow   = q("lf-qp-cb-row"),   refRow = q("lf-qp-ref-row");

        if (amexRow) amexRow.style.display = amexOn ? "" : "none";
        if (fxRow)   fxRow.style.display   = fxOn   ? "" : "none";
        if (cbRow)   cbRow.style.display   = cbOn   ? "" : "none";
        if (refRow)  refRow.style.display  = refOn  ? "" : "none";

        if (q("lf-qp-amex-val")) q("lf-qp-amex-val").textContent = amexPct.toFixed(2) + "% + " + (q("lf-amex-input")?.dataset?.fixed || "20") + "p per transaction";
        if (q("lf-qp-fx-val"))   q("lf-qp-fx-val").textContent   = fxPct.toFixed(2) + "%";
        if (q("lf-qp-cb-val"))   q("lf-qp-cb-val").textContent   = "£" + cbAmt.toFixed(2) + " per chargeback";
        if (q("lf-qp-ref-val"))  q("lf-qp-ref-val").textContent  = "£" + refAmt.toFixed(2) + " per refund";
      };

      ["amex", "fx", "chargeback", "refund"].forEach(fee => {
        q(`lf-toggle-${fee}`)?.addEventListener("change", updateFeeRows);
        q(`lf-${fee}-input`)?.addEventListener("input",  updateFeeRows);
      });

      // Run once on load to set initial state
      updateFeeRows();

      // Tab switching for Step 7
      this.overlay.querySelectorAll(".lf-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          const tabName = e.target.dataset.tab;
          this.lead.volumeTab = tabName;
          this._scheduleSave();
          this._render();
        });
      });

      // Real-time email / website validation (Step 8)
      const emailEl   = q("lf-email");
      const websiteEl = q("lf-website");

      const showFieldHint = (el, msg) => {
        let hint = el?.parentElement?.querySelector(".lf-field-hint");
        if (!hint) {
          hint = document.createElement("div");
          hint.className = "lf-field-hint";
          el.parentElement.appendChild(hint);
        }
        hint.textContent = msg;
        hint.style.color = msg ? "#dc2626" : "";
        if (msg) el.style.borderColor = "#dc2626";
        else     el.style.borderColor = "";
      };

      emailEl?.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        if (!v) { showFieldHint(emailEl, ""); return; }
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
        showFieldHint(emailEl, ok ? "" : "Enter a valid email address");
      });

      websiteEl?.addEventListener("input", (e) => {
        const v = e.target.value.trim();
        if (!v) { showFieldHint(websiteEl, ""); return; }
        const test = /^https?:\/\//.test(v) ? v : "https://" + v;
        const ok   = /^https?:\/\/[^\s@]+\.[^\s@]+$/.test(test);
        showFieldHint(websiteEl, ok ? "" : "Enter a valid URL (e.g. https://example.com)");
      });

      // Industry autocomplete logic
      const industryInput = q("lf-industry");
      const industryDropdown = q("lf-industry-dropdown");
      if (industryInput && industryDropdown) {
        const allCats = (window.RiskEngine?.INDUSTRY_CATEGORIES || []).map(c => c.label);
        const prohibited = window.RiskEngine?.PROHIBITED_INDUSTRIES || [];
        const restrictedList = window.RiskEngine?.RESTRICTED_INDUSTRIES || [];

        const filterDropdown = (query) => {
          const q2 = query.toLowerCase();
          const opts = industryDropdown.querySelectorAll(".lf-industry-opt");
          let anyVisible = false;
          opts.forEach(opt => {
            const match = !q2 || opt.dataset.value.toLowerCase().includes(q2);
            opt.style.display = match ? "" : "none";
            if (match) anyVisible = true;
          });
          industryDropdown.style.display = anyVisible ? "" : "none";
        };

        const updateIndustryWarning = (val) => {
          const wrap = q("lf-industry-wrap");
          if (!wrap) return;
          // Remove old status
          wrap.querySelectorAll(".lf-industry-status").forEach(el => el.remove());
          industryInput.classList.remove("lf-industry-prohibited", "lf-industry-restricted");

          const vl = val.toLowerCase();
          const isP = prohibited.some(p => vl.includes(p));
          const isR = !isP && restrictedList.some(r => vl.includes(r));

          if (isP) {
            industryInput.classList.add("lf-industry-prohibited");
            const div = document.createElement("div");
            div.className = "lf-industry-status lf-industry-status-red";
            div.textContent = "🚫 Prohibited industry — this lead cannot proceed";
            industryInput.insertAdjacentElement("afterend", div);
          } else if (isR) {
            industryInput.classList.add("lf-industry-restricted");
            const div = document.createElement("div");
            div.className = "lf-industry-status lf-industry-status-amber";
            div.textContent = "⚠️ Restricted industry — additional review may be required";
            industryInput.insertAdjacentElement("afterend", div);
          }
        };

        industryInput.addEventListener("focus", () => filterDropdown(industryInput.value));
        industryInput.addEventListener("input", (e) => {
          filterDropdown(e.target.value);
          this.lead.industry = e.target.value;
          updateIndustryWarning(e.target.value);
          this._updateQualificationWarning();
          this._scheduleSave();
        });
        industryDropdown.querySelectorAll(".lf-industry-opt").forEach(opt => {
          opt.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const chosen = opt.dataset.value;
            industryInput.value = chosen;
            this.lead.industry = chosen;
            industryDropdown.style.display = "none";
            updateIndustryWarning(chosen);
            this._updateQualificationWarning();
            this._scheduleSave();
          });
        });
        document.addEventListener("click", (e) => {
          if (!industryInput.contains(e.target) && !industryDropdown.contains(e.target)) {
            industryDropdown.style.display = "none";
          }
        }, { capture: true });
      }

      // ── Country typeahead wiring ───────────────────────────
      const countryInput    = q("lf-country");
      const countryDropdown = q("lf-country-dropdown");
      if (countryInput && countryDropdown) {
        const prohibitedCountries = window.RiskEngine?.PROHIBITED_COUNTRIES || [];
        const restrictedCountries = window.RiskEngine?.RESTRICTED_COUNTRIES || [];

        const filterCountries = (query) => {
          const q2 = query.toLowerCase().trim();
          const opts = countryDropdown.querySelectorAll(".lf-industry-opt");
          let anyVisible = false;
          opts.forEach(opt => {
            const match = !q2 || opt.dataset.value.toLowerCase().includes(q2);
            opt.style.display = match ? "" : "none";
            if (match) anyVisible = true;
          });
          countryDropdown.style.display = anyVisible ? "" : "none";
        };

        const updateCountryWarning = (val) => {
          const wrap = q("lf-country-wrap");
          if (!wrap) return;
          wrap.querySelectorAll(".lf-industry-status").forEach(el => el.remove());
          countryInput.classList.remove("lf-industry-prohibited", "lf-industry-restricted");
          const vl = val.toLowerCase();
          const isP = prohibitedCountries.some(c => vl.includes(c.toLowerCase()));
          const isR = !isP && restrictedCountries.some(c => c.toLowerCase() === vl);
          if (isP) {
            countryInput.classList.add("lf-industry-prohibited");
            const div = document.createElement("div");
            div.className = "lf-industry-status lf-industry-status-red";
            div.textContent = "🚫 We do not accept merchants from this country";
            countryInput.insertAdjacentElement("afterend", div);
          } else if (isR) {
            countryInput.classList.add("lf-industry-restricted");
            const div = document.createElement("div");
            div.className = "lf-industry-status lf-industry-status-amber";
            div.textContent = "⚠️ Higher-risk jurisdiction — additional review required";
            countryInput.insertAdjacentElement("afterend", div);
          }
        };

        // Show dropdown on focus (show all if empty, filtered if has value)
        countryInput.addEventListener("focus", () => {
          filterCountries(countryInput.value);
        });

        // Filter as user types
        countryInput.addEventListener("input", (e) => {
          filterCountries(e.target.value);
          this.lead.country = e.target.value;
          updateCountryWarning(e.target.value);
          this._updateQualificationWarning();
          this._scheduleSave();
        });

        // Select a country from dropdown
        countryDropdown.querySelectorAll(".lf-industry-opt").forEach(opt => {
          opt.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const chosen = opt.dataset.value;
            countryInput.value = chosen;
            this.lead.country = chosen;
            countryDropdown.style.display = "none";
            updateCountryWarning(chosen);
            this._updateQualificationWarning();
            this._scheduleSave();
          });
        });

        // Close dropdown when clicking outside
        document.addEventListener("click", (e) => {
          if (!countryInput.contains(e.target) && !countryDropdown.contains(e.target)) {
            countryDropdown.style.display = "none";
          }
        }, { capture: true });
      }

      // Input autosave + qualification warnings
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

      // ── CSV Upload wiring ──────────────────────────────────
      const dropzone  = document.getElementById("lf-csv-dropzone");
      const fileInput = document.getElementById("lf-csv-file-input");
      const clearBtn  = document.getElementById("lf-csv-clear");

      if (fileInput) {
        // fileInput change — primary upload path
        fileInput.addEventListener("change", async (e) => {
          const file = e.target.files && e.target.files[0];
          if (!file) return;
          await this._handleCSVFile(file);
          // reset so same file can be re-selected
          e.target.value = "";
        });
      }

      if (dropzone && fileInput) {
        // clicking the label triggers the hidden input
        dropzone.addEventListener("click", (e) => {
          e.preventDefault();
          fileInput.click();
        });

        dropzone.addEventListener("dragenter", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("lf-dz-over");
        });
        dropzone.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("lf-dz-over");
        });
        dropzone.addEventListener("dragleave", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("lf-dz-over");
        });
        dropzone.addEventListener("drop", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("lf-dz-over");
          const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (!file) return;
          await this._handleCSVFile(file);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          this.lead.monthlyVolume       = "";
          this.lead.avgTransactionValue = "";
          this.lead.transactionCount    = "";
          this.lead.currentMonthlyFees  = "";
          this.lead.csvDebitFrac        = "";
          this.lead.csvCurrentRate      = "";
          this.lead.csvCardMix          = "";
          this.lead.csvTierLabel        = "";
          this.lead.csvProcessor        = "";
          this.lead.csvFileName         = "";
          this.lead.csvDateRange        = "";
          this.lead.csvParseError       = null;
          this.lead.volumeTab           = "csv";
          // Clear cached result so Step 10 recalculates with fresh data
          this.pricingResult            = null;
          this._render();
        });
      }
    }

    // ── Update qualification warning banners for Step 1 ──────
    _updateQualificationWarning() {
      const oldWarning = this.overlay.querySelector(".lf-qual-warning");
      if (oldWarning) oldWarning.remove();

      if (this.currentStep !== 1) return;

      const rawCountry = this.lead.country || "";
      const matchedC   = COUNTRIES.find(c => c.toLowerCase() === rawCountry.toLowerCase()) || rawCountry;
      const country     = matchedC;
      const industry    = this.lead.industry       || "";
      const indDetail   = this.lead.industryDetail || "";
      const check = window.RiskEngine.checkQualification(country, industry, indDetail);

      if (!check.allowed) {
        const banner = document.createElement("div");
        banner.className = "lf-qual-warning lf-qual-prohibited";
        // Determine whether country or industry triggered the block
        const countryCheck  = window.RiskEngine.checkQualification(country, "");
        const industryCheck = window.RiskEngine.checkQualification("United Kingdom", industry, indDetail);
        let msg;
        if (!countryCheck.allowed) {
          msg = `🚫 We do not accept merchants operating from <strong>${country}</strong>. This lead cannot proceed.`;
        } else if (!industryCheck.allowed) {
          const industryLabel = indDetail || industry;
          msg = `🚫 We do not accept merchants in the <strong>${industryLabel}</strong> industry. This lead cannot proceed.`;
        } else {
          msg = `🚫 ${check.reason || "This combination is not supported. This lead cannot proceed."}`;
        }
        banner.innerHTML = `<span class="lf-qual-icon">🚫</span><span class="lf-qual-text">${msg}</span>`;
        const fieldsContainer = this.overlay.querySelector(".lf-fields");
        if (fieldsContainer) fieldsContainer.parentElement.insertBefore(banner, fieldsContainer);
      } else if (check.restricted) {
        const banner = document.createElement("div");
        banner.className = "lf-qual-warning lf-qual-restricted";
        const countryRestrictedCheck = window.RiskEngine.checkQualification(country, "");
        let msg;
        if (countryRestrictedCheck.restricted) {
          msg = `⚠️ <strong>${country}</strong> is a higher-risk jurisdiction. This lead can proceed but will require additional compliance review.`;
        } else {
          msg = `⚠️ ${check.reason || "This country/industry is restricted. Additional review may be required."}`;
        }
        banner.innerHTML = `<span class="lf-qual-icon">⚠️</span><span class="lf-qual-text">${msg}</span>`;
        const fieldsContainer = this.overlay.querySelector(".lf-fields");
        if (fieldsContainer) fieldsContainer.parentElement.insertBefore(banner, fieldsContainer);
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
    // ── Handle CSV File Upload ─────────────────────────────────────────────
    // Full statement analysis — same logic as the public quote builder.
    // Extracts: volume, fees, current effective rate, card mix, debit fraction,
    // merchant tier, processor detection. All values persisted onto lead.
    async _handleCSVFile(file) {
      this.lead.csvLoading    = true;
      this.lead.csvParseError = null;
      this._render();

      try {
        const text   = await file.text();
        const result = this._analyseStatement(text, file.name);
        const s      = result.summary;

        // ── Persist ALL statement-derived fields ──────────────────────────
        this.lead.monthlyVolume       = s.vol;
        this.lead.avgTransactionValue = s.cnt > 0 ? Number((s.vol / s.cnt).toFixed(2)) : "";
        this.lead.transactionCount    = s.cnt || "";
        // currentMonthlyFees → feeds "Currently Paying" and pricing engine
        this.lead.currentMonthlyFees  = s.totalFees > 0 ? Number(s.totalFees.toFixed(2)) : "";
        // csvDebitFrac → actual card mix, replaces hardcoded 0.70 in pricing call
        this.lead.csvDebitFrac        = s.debitFrac;
        // csvIntlFrac → statement-derived international fraction (null when undetectable)
        // Manual intlPercentage always wins — only set csvIntlFrac, never overwrite intlPercentage
        this.lead.csvIntlFrac         = s.csvIntlFrac;
        // csvCurrentRate → pre-calculated effective rate for Step 10 display fallback
        this.lead.csvCurrentRate      = s.currentRate > 0 ? Number(s.currentRate.toFixed(4)) : "";
        this.lead.csvCardMix          = s.cardMix ? JSON.stringify(s.cardMix) : "";
        this.lead.csvTierLabel        = s.tierLabel || "";
        this.lead.csvProcessor        = s.processor || "";
        this.lead.csvFileName         = file.name;
        this.lead.csvLoading          = false;
        this.lead.csvParseError       = null;
        this.lead.volumeTab           = "csv";
        // Clear stale pricingResult so Step 10 recalculates with fresh data
        this.pricingResult            = null;

        await this._saveNow();
        this._render();
      } catch (err) {
        console.error("CSV parse error:", err);
        this.lead.csvLoading    = false;
        this.lead.csvParseError = err.message || "Could not parse CSV. Please check the format.";
        this._render();
      }
    }

    // ── Statement analyser — identical logic to processCSV() in public quote builder ──
    _analyseStatement(csvText, fileName) {
      if (!csvText || !String(csvText).trim()) {
        throw new Error("CSV file is empty");
      }

      // RFC-4180 line splitter
      const splitLine = (line) => {
        const out = []; let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i], nx = line[i + 1];
          if (ch === '"') {
            if (inQ && nx === '"') { cur += '"'; i++; } else inQ = !inQ;
          } else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
          else { cur += ch; }
        }
        out.push(cur);
        return out.map(v => v.trim());
      };

      const lines = String(csvText)
        .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
        .split("\n").filter(l => l.trim().length > 0);

      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

      const rawHeaders   = splitLine(lines[0]);
      const lowerHeaders = rawHeaders.map(h => h.toLowerCase());

      // Convert to row objects (same as Papa.parse header:true)
      const rows = lines.slice(1).map(l => {
        const cols = splitLine(l);
        const obj  = {};
        rawHeaders.forEach((h, i) => { obj[h] = (cols[i] || "").trim(); });
        return obj;
      }).filter(r => Object.values(r).some(v => v !== ""));

      if (!rows.length) throw new Error("No data rows found in CSV");

      // ── Column detection — same HINTS as public quote builder ─────────────
      const HINTS = {
        // "payment" removed — matches "Payment Method" before real amount columns.
        // amount detection handled separately below with two-pass priority logic.
        amount:   ["amount","gross","total","value","sale","charge","net"],
        fee:      ["fee","fees","processing","commission","cost","charge_amount","charge"],
        cardType: ["card","brand","scheme","network","card_brand"],
        // rowType: "type" is exact-only to prevent matching "Card Type", "Payment Type" etc.
        // Multi-word phrases use includes() via the existing isMultiWord path.
        rowType:  ["transaction type","entry type","record type","transaction_type","entry_type","record_type","__exact__type"],
        // ── International detection columns ─────────────────────────────────
        // Priority 1: card/issuing country (Stripe: "Card Issue Country", Adyen: "Issued Country")
        country:  ["card issue country","issued country","card country","issuing country","card_country","card_issue_country"],
        currency: ["currency","converted currency","transaction currency"],
      };
      const colMap = {};
      for (const [field, hints] of Object.entries(HINTS)) {
        colMap[field] = "";
        for (const hint of hints) {
          // "__exact__" prefix forces exact-match regardless of word count
          if (hint.startsWith("__exact__")) {
            const exact = hint.slice(9);
            const match = rawHeaders.find((_, i) => lowerHeaders[i] === exact);
            if (match) { colMap[field] = match; break; }
            continue;
          }
          // Multi-word hints use full-string match; single-word use substring
          const isMultiWord = hint.includes(" ");
          const match = rawHeaders.find((_, i) =>
            isMultiWord ? lowerHeaders[i] === hint : lowerHeaders[i].includes(hint)
          );
          if (match) { colMap[field] = match; break; }
        }
      }

      // ── Amount column — two-pass selection ───────────────────────────────
      // Pass 1: collect all candidate headers that match any amount hint.
      // Ordered by priority: gross > amount > total > value > sale > charge > net.
      // "payment" excluded — too broad, hits "Payment Method" before real amount cols.
      const AMOUNT_PRIORITY = ["gross","amount","total","value","sale","charge","net"];
      const amountCandidates = [];
      for (const hint of AMOUNT_PRIORITY) {
        const matches = rawHeaders.filter((_, i) => lowerHeaders[i].includes(hint));
        for (const h of matches) {
          if (!amountCandidates.includes(h)) amountCandidates.push(h);
        }
      }
      // Pass 2: from candidates, prefer the first one where the first data row
      // contains a parseable positive number. Falls back to first candidate if none parse.
      const pAmtTest = (v) => { const n = parseFloat(String(v||"").replace(/[£$€,\s]/g,"")); return Number.isFinite(n) && n > 0; };
      const firstDataRow = rows[0] || {};
      const numericCandidate = amountCandidates.find(h => pAmtTest(firstDataRow[h]));
      colMap.amount = numericCandidate || amountCandidates[0] || "";

      if (!colMap.amount) {
        throw new Error("Could not find an amount column. Supported names: amount, gross, total, value, sale, charge, net");
      }

      // Strip currency symbols — same as pAmt() in public quote builder
      const pAmt = (v) => {
        const n = parseFloat(String(v || "").replace(/[£$€,\s]/g, ""));
        return isNaN(n) || n <= 0 ? null : n;
      };

      // Card type classifier — identical to classCard() in public quote builder
      const classCard = (s) => {
        s = (s || "").toLowerCase();
        if (s.includes("amex") || s.includes("american express")) return "amex";
        if (s.includes("visa") && (s.includes("debit") || s.includes(" db "))) return "visa_debit";
        if (s.includes("visa"))   return "visa_credit";
        if ((s.includes("master") || s.includes("mc")) && s.includes("debit")) return "mc_debit";
        if (s.includes("maestro")) return "maestro";
        if (s.includes("master") || s.includes("mc")) return "mc_credit";
        if (s.includes("debit"))  return "visa_debit";
        if (s.includes("credit")) return "visa_credit";
        return "mixed";
      };
      const isDebitCard = (k) => ["visa_debit","mc_debit","maestro"].includes(k);

      // Processor detection — same keywords as public quote builder
      const PROCESSORS = {
        Stripe:       ["stripe","balance_transaction","charge_id","payout"],
        Worldpay:     ["worldpay","authcode","merchantnumber"],
        Barclaycard:  ["barclaycard","merchant service charge","bcs"],
        Square:       ["square","tender_type"],
        Adyen:        ["adyen","pspreference","shopper"],
        SumUp:        ["sumup","sum up"],
        Zettle:       ["zettle","izettle","paypal here"],
        Takepayments: ["takepayments","take payments"],
      };
      let processor = null;
      const haystack = ((fileName || "") + " " + lowerHeaders.join(" ")).toLowerCase();
      for (const [name, keywords] of Object.entries(PROCESSORS)) {
        if (keywords.some(kw => haystack.includes(kw))) { processor = name; break; }
      }

      // ── International detection mode ──────────────────────────────────────
      // Only country column is reliable enough to derive intlFrac.
      // Currency is NOT used — non-GBP currency ≠ international card origin
      // (e.g. a French tourist paying in GBP counts as non-GBP but non-UK card).
      // If no country column → intlFrac = null. Do not guess.
      const intlMode = colMap.country ? "country" : "none";

      // ── Main aggregation — identical to processCSV() in public quote builder ──
      let vol = 0, cnt = 0, totalFees = 0, intlVol = 0, countryPopulated = 0;
      const cardData = {};

      rows.forEach(r => {
        // Row type filter: skip non-charge rows (fees, refunds, payouts)
        if (colMap.rowType) {
          const rowT = (r[colMap.rowType] || "").toUpperCase().trim();
          if (rowT && !["CHARGE","PAYMENT","SALE","TRANSACTION","DEBIT","SETTLED","CAPTURE",""].includes(rowT)) return;
        }
        const a = pAmt(r[colMap.amount]);
        if (!a) return;

        cnt++; vol += a;

        // Fee column — total fees paid to current processor
        const fv = colMap.fee ? (pAmt(r[colMap.fee]) || 0) : 0;
        if (fv) totalFees += fv;

        // Card type for debit/credit mix
        const k = colMap.cardType ? classCard(r[colMap.cardType]) : "mixed";
        if (!cardData[k]) cardData[k] = { vol: 0, cnt: 0 };
        cardData[k].vol += a;
        cardData[k].cnt++;

        // International volume tracking — country mode only
        if (intlMode === "country") {
          const c = (r[colMap.country] || "").trim().toUpperCase();
          if (c !== "") {
            countryPopulated++;
            const isUK = c === "GB" || c === "GBR" || c === "UNITED KINGDOM" || c === "UK";
            if (!isUK) intlVol += a;
          }
        }
      });

      if (vol <= 0) throw new Error("No valid transaction amounts found in this CSV.");
      if (cnt < 2)  throw new Error("Not enough transactions found. Please upload a fuller statement or use Manual Entry.");

      // Debit fraction from actual card mix — same as public quote builder
      let debitVol = 0;
      Object.entries(cardData).forEach(([k, v]) => { if (isDebitCard(k)) debitVol += v.vol; });
      const debitFrac = vol > 0 ? debitVol / vol : 0.70;

      // Current effective rate — fees / volume * 100
      const currentRate = (totalFees > 0 && vol > 0) ? (totalFees / vol) * 100 : 0;

      // International fraction — requires country column AND ≥80% row coverage
      // Below 80% coverage the country column is too sparse to trust — return null.
      // Prefer null over a silently understated intlFrac.
      const countryCoverage = cnt > 0 ? countryPopulated / cnt : 0;
      const csvIntlFrac = (intlMode === "country" && vol > 0 && countryCoverage >= 0.80)
        ? Math.round((intlVol / vol) * 10000) / 10000
        : null;

      // Merchant tier
      let tierLabel = "Small merchant";
      if      (vol >= 200000) tierLabel = "Large merchant";
      else if (vol >= 50000)  tierLabel = "Medium merchant";

      return {
        summary: {
          vol:          Number(vol.toFixed(2)),
          cnt,
          totalFees:    Number(totalFees.toFixed(2)),
          debitFrac:    Number(debitFrac.toFixed(4)),
          currentRate:  Number(currentRate.toFixed(4)),
          csvIntlFrac,   // null when undetectable or coverage < 80%, 0–1 when reliably derived
          intlMode,      // "country" | "none"
          cardMix:       cardData,
          tierLabel,
          processor,
        },
      };
    }

    // ── Apply Pricing Override ──────────────────────────────
    _applyPricingOverride() {
      const rateEl  = document.getElementById("lf-override-rate");
      const fixedEl = document.getElementById("lf-override-fixed");
      if (!rateEl || !fixedEl) return;

      let newRate  = parseFloat(rateEl.value);
      let newFixed = parseFloat(fixedEl.value);

      const MIN_FIXED = 10;   // pence — hard floor
      const MIN_RATE  = 0.76; // 0.46 cost + 0.30 min margin

      // Hard-clamp — never let values below minimums save
      if (isNaN(newRate)  || newRate  < MIN_RATE)  newRate  = MIN_RATE;
      if (isNaN(newFixed) || newFixed < MIN_FIXED)  newFixed = MIN_FIXED;

      // Sync inputs back to clamped values so UI matches
      rateEl.value  = newRate;
      fixedEl.value = newFixed;

      // Remove any old override feedback
      const old = document.getElementById("lf-override-feedback");
      if (old) old.remove();

      // Show success feedback inline
      const fb = document.createElement("div");
      fb.id = "lf-override-feedback";
      fb.style.cssText = "font-size:11px;color:#00916e;font-weight:600;margin-top:6px;";
      fb.textContent = `✓ Pricing updated — Rate: ${newRate}%  Fixed: ${newFixed}p`;
      document.getElementById("lf-apply-override")?.insertAdjacentElement("afterend", fb);
      setTimeout(() => fb?.remove(), 3000);

      this.pricingResult.rate      = newRate;
      this.pricingResult.fixed_fee = newFixed;
      this.lead.processingRate     = newRate;
      this.lead.fixedFee           = newFixed;
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
        // Case-insensitive country match — also auto-corrects casing
        const typedCountry = String(this.lead.country).trim();
        const matchedCountry = COUNTRIES.find(c => c.toLowerCase() === typedCountry.toLowerCase());
        if (!matchedCountry) {
          this._fieldError("lf-country", "Please select a valid country from the list");
          return false;
        }
        // Fix casing so downstream logic (RiskEngine) works correctly
        this.lead.country = matchedCountry;
        const countryEl = document.getElementById("lf-country");
        if (countryEl) countryEl.value = matchedCountry;
        if (!this.lead.industry || !String(this.lead.industry).trim()) {
          this._fieldError("lf-industry", "Industry is required");
          return false;
        }
      }

      // Step 2: website URL format validation
      if (this.currentStep === 2) {
        if (this.lead.website && String(this.lead.website).trim()) {
          const w = this.lead.website.trim();
          const testUrl = /^https?:\/\//.test(w) ? w : "https://" + w;
          if (!/^https?:\/\/[^\s@]+\.[^\s@]+$/.test(testUrl)) {
            this._fieldError("lf-website", "Enter a valid website URL (e.g. https://example.com)");
            return false;
          }
        }
      }

      // Step 4: intlPercentage required (must be a number 0-100), plus businessAge + deliveryTime
      if (this.currentStep === 4) {
        const intlVal = this.lead.intlPercentage;
        if (intlVal === undefined || intlVal === null || String(intlVal).trim() === "") {
          this._fieldError("lf-intlPercentage", "International transactions % is required — enter 0 if none");
          return false;
        }
        const intlNum = parseFloat(intlVal);
        if (isNaN(intlNum) || intlNum < 0 || intlNum > 100) {
          this._fieldError("lf-intlPercentage", "Enter a percentage between 0 and 100");
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
        const check = window.RiskEngine.checkQualification(this.lead.country, this.lead.industry, this.lead.industryDetail);
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

      const vol        = parseFloat(this.lead.monthlyVolume)       || 0;
      const avgTx      = parseFloat(this.lead.avgTransactionValue) || 55;
      const txCnt      = avgTx > 0 ? Math.round(vol / avgTx) : Math.round(vol / 55);
      const curFees    = parseFloat(this.lead.currentMonthlyFees)  || 0;

      // Debit fraction — priority: CSV card mix → intl% proxy → UK default 0.70
      const csvDebitFrac = parseFloat(this.lead.csvDebitFrac);
      // ── intlFrac: three-source priority chain ─────────────────────────────
      // 1. Manual intlPercentage (Step 4 field) — explicit user input, highest trust
      //    Convert % → decimal. Valid range 0–100 inclusive (0 is legitimate).
      // 2. CSV-derived csvIntlFrac — statement-detected, already stored as 0–1
      // 3. null — no real data available; API will suppress blended rate
      const manualIntlPct  = parseFloat(this.lead.intlPercentage);
      const csvIntlFracVal = (this.lead.csvIntlFrac !== null && this.lead.csvIntlFrac !== undefined)
        ? parseFloat(this.lead.csvIntlFrac) : null;

      let intlFrac = null;
      if (Number.isFinite(manualIntlPct) && manualIntlPct >= 0 && manualIntlPct <= 100) {
        intlFrac = manualIntlPct / 100;                    // manual wins
      } else if (csvIntlFracVal !== null && Number.isFinite(csvIntlFracVal)) {
        intlFrac = csvIntlFracVal;                         // CSV fallback
      }
      // else: intlFrac remains null → API returns split_indicative, no blended rate

      // intlPct as percentage for debitFrac proxy calculation (unchanged behaviour)
      const intlPct = intlFrac !== null ? intlFrac * 100 : 0;

      const debitFrac    = (csvDebitFrac > 0 && csvDebitFrac <= 1) ? csvDebitFrac
                         : intlPct > 50 ? 0.50
                         : intlPct > 20 ? 0.60
                         : 0.70;

      // Current fees — priority: manual entry → back-calculated from CSV effective rate
      const csvCurrentRate   = parseFloat(this.lead.csvCurrentRate) || 0;
      const effectiveCurFees = curFees > 0 ? curFees
                             : (csvCurrentRate > 0 && vol > 0) ? (csvCurrentRate / 100) * vol
                             : 0;

      // Derive current effective rate for Step 10 display
      const derivedCurRate =
        effectiveCurFees > 0 && vol > 0 ? Math.round((effectiveCurFees / vol * 100) * 100) / 100 :
        csvCurrentRate > 0              ? Math.round(csvCurrentRate * 100) / 100 :
        null;

      try {
        const resp = await fetch("/api/calculate_quote", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            merchant_name:          this.lead.contactName  || this.lead.businessName || "",
            merchant_email:         this.lead.email        || "admin@mintedpay.com",
            monthly_volume:         vol,
            transaction_count:      txCnt,
            current_fees:           effectiveCurFees,
            debit_frac:             debitFrac,
            // intl_frac: manual % → CSV-derived → null (priority order above)
            intl_frac:              intlFrac,
            // Tell the engine whether debitFrac came from real CSV card-mix detection
            csv_debit_frac_is_real: (csvDebitFrac > 0 && csvDebitFrac <= 1),
            // Pricing profile — admin-selectable, defaults to standard
            pricing_profile: this.lead.pricingProfile || "standard",
          }),
        });
        const data = await resp.json();
        if (data.success) {
          this.pricingResult = data;
          // Prefer locally derived current_rate (more accurate) over API value
          // API calculates current_rate from current_fees/vol too, but we make sure
          // it's always set here for consistency
          if (derivedCurRate !== null) {
            this.pricingResult.current_rate = derivedCurRate;
          }
          this.lead.quote_id       = data.quote_id;
          this.lead.processingRate = data.rate;
          this.lead.fixedFee       = data.fixed_fee;
          this.lead.pricing = {
            rate:                 data.rate,
            fixedFee:             data.fixed_fee,
            currentRate:          derivedCurRate,
            currentMonthlyFees:   effectiveCurFees || null,
            estimatedMonthlyCost: ((vol * data.rate / 100) + (txCnt * data.fixed_fee / 100)).toFixed(2),
            margin:               (data.rate - 0.46).toFixed(2),
          };
        } else {
          this.pricingResult = { rate: 0, fixed_fee: 0, success: false, _error: data.error };
          if (derivedCurRate !== null) {
            this.pricingResult.current_rate = derivedCurRate;
          }
        }
      } catch (e) {
        console.error("Pricing error:", e);
        this.pricingResult = { rate: 0, fixed_fee: 0, success: false, _error: String(e) };
        if (derivedCurRate !== null) {
          this.pricingResult.current_rate = derivedCurRate;
        }
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
