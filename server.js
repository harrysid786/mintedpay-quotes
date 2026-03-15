require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const quotesRoute     = require("./routes/quotes");
const acceptanceRoute = require("./routes/acceptance");
const pricingRoute    = require("./routes/pricing");
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/agreements", express.static(path.join(__dirname, "agreements")));
app.use("/api/quotes",           quotesRoute);
app.use("/api/quote_acceptance", acceptanceRoute);
app.use("/api/calculate_quote",  pricingRoute);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});
app.listen(PORT, () => {
  console.log(`\n🚀  MintedPay Quote Server running on http://localhost:${PORT}`);
});
