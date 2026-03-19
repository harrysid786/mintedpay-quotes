require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");

const quotesRoute     = require("./routes/quotes");
const acceptanceRoute = require("./routes/acceptance");
const pricingRoute    = require("./routes/pricing");
const leadsRoute      = require("./routes/leads");      // ← NEW: Back Office leads API

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/agreements", express.static(path.join(__dirname, "agreements")));

// ── Existing routes (unchanged) ───────────────────────────────
app.use("/api/quotes",           quotesRoute);
app.use("/api/quote_acceptance", acceptanceRoute);
app.use("/api/calculate_quote",  pricingRoute);

// ── NEW: Leads / Back Office API ──────────────────────────────
app.use("/api/leads", leadsRoute);

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ── Admin panel redirect (/admin → /admin/index.html) ─────────
app.get("/admin", (_req, res) => res.redirect("/admin/index.html"));

// ── Pricing Engine Settings clean URL ─────────────────────────
// Serves settings.html at /admin/settings (no .html extension needed).
// /admin/settings.html still works via express.static above.
app.get("/admin/settings", (_req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/settings.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🚀  MintedPay Quote Server running on http://localhost:${PORT}`);
  console.log(`🏢  Admin panel: http://localhost:${PORT}/admin`);
});
