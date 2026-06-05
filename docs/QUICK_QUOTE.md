# Quick Quote — Admin Workflow

**Status:** Live (production) · **Shipped:** commit `bb8df3d` (2026-06-05) · **Brands:** MintedPay + Ummah

## Purpose
A fast admin path to price a merchant without completing the full qualification/risk
assessment first. For merchants who send a statement by email, phone in, or are met at
an event, where pricing is needed quickly. Sits **alongside** the existing "New Lead"
qualification workflow, which is unchanged.

## How to use it (admin)
1. In the admin back office, click **⚡ Quick Quote** (beside **+ New Lead**).
2. Enter **Business Name**, **Contact Name**, **Email** (email required). Click **Start →**.
3. A lead is created (`leadSource = quick_quote`, `qualificationStatus = pending`) and the
   existing LeadFlow opens **directly on Step 2 (pricing)** — the qualification step is skipped.
4. Upload a CSV statement **or** enter figures manually (existing Step 2 UI).
5. Click **Generate Quote** (existing flow). The quote is created, attached to the lead,
   and the lead status moves to `quoted`.
6. Send the quote link to the merchant via the existing send flow.
7. The merchant opens and accepts the quote via the existing acceptance + agreement flow.
8. If the merchant progresses, click **Complete Qualification** on the lead to run it
   through the normal Step 1 qualification (the RiskEngine gate runs at that point).
   The quote and all prior data are preserved.

## CRM visibility
Quick Quote leads are visually identifiable in the lead list:
- **⚡ Quick Quote** badge (any lead with `leadSource = quick_quote`).
- **⏳ Qual: Pending** badge (while `qualificationStatus = pending` / unset).
- **Complete Qualification** action button (only on pending quick-quote leads).
Standard leads show none of these.

## What it reuses (unchanged)
Pricing engine, CSV parser / statement analysis (`_analyseStatement`), quote generation
(`/api/calculate_quote`), quote→lead attachment (`quote_id` + autosave PUT), send flow
(`_sendQuote`), acceptance (`/api/quote_acceptance`), and agreement generation.

## What was added
Entirely additive, client-side only, no schema change:
- `public/admin/index.html` — Quick Quote button + 3-field intake modal.
- `public/admin/admin.js` — `adminQuickQuote()`, `adminCompleteQualification()`,
  CRM badges, Complete Qualification row action.
- `public/admin/leadFlow.js` — `openQuickQuote()` (opens existing flow at Step 2).
  The existing `open()` method is unchanged.

## Data model (no new schema)
Quick Quote leads are ordinary lead records. The two markers live in the lead `data` JSON blob:
- `leadSource: "quick_quote"`
- `qualificationStatus: "pending"`

## Verification (signed off 2026-06-05)
Full end-to-end journey verified live: create → Step 2 → CSV parse → generate → attach/persist
→ send → merchant accept (recorded) → Complete Qualification → RiskEngine runs → lifecycle
preserved. Badges and standard-lead isolation confirmed. New Lead and existing quote
workflows confirmed unaffected.

## Known issues (tracked separately, NOT part of this workstream)
1. **csvDebitFrac classification** — `_analyseStatement` returned debit fraction 0 on a test
   statement containing debit rows; the debit/credit column may not be picked up. Affects the
   shared admin parser, not Quick Quote. Backlog item.
2. **Agreement PDF generation freeze** — synchronous jsPDF agreement generation can briefly
   freeze the merchant quote tab after acceptance (acceptance is still recorded correctly).
   Affects the shared agreement flow, not Quick Quote. Backlog item.

## Future improvements (optional, not scheduled)
- Surface a dedicated "Quick Quote / Needs Qualification" filter in the admin list.
- Optional partial-save on Step 1 so Complete Qualification can be done incrementally.
- Resume behaviour: confirm a reopened quick-quote lead lands on the intended step.
