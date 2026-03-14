const PDFDocument = require("pdfkit");
const fs          = require("fs");
const path        = require("path");

const AGREEMENTS_DIR = path.join(__dirname, "..", "agreements");
if (!fs.existsSync(AGREEMENTS_DIR)) fs.mkdirSync(AGREEMENTS_DIR, { recursive: true });

function generateAgreementPDF(quote, acceptance) {
  return new Promise((resolve, reject) => {
    const brandName = (() => {
      try {
        const b = typeof quote.brand === "string" ? JSON.parse(quote.brand) : quote.brand;
        return b?.name || "Minted Pay";
      } catch (_) { return "Minted Pay"; }
    })();

    const filePath = path.join(AGREEMENTS_DIR, `Merchant_Agreement_${quote.quote_id}.pdf`);
    const doc      = new PDFDocument({ size: "A4", margin: 50 });
    const stream   = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const BRAND_COLOUR = "#4F35F3";
    const BLACK        = "#111111";
    const GREY         = "#6b7280";
    const W            = doc.page.width;
    const ML           = 50;
    const MR           = 50;

    function hline(y, colour = "#e5e5e5") {
      doc.save().strokeColor(colour).moveTo(ML, y).lineTo(W - MR, y).stroke().restore();
    }
    function header(pageLabel) {
      doc.save().rect(0, 0, W, 36).fill(BRAND_COLOUR).restore();
      doc.fontSize(11).fillColor("#ffffff").font("Helvetica-Bold").text(brandName.toUpperCase(), ML, 12);
      doc.fontSize(8).font("Helvetica").text(pageLabel, 0, 14, { align: "right", width: W - MR });
    }
    function footer(pageNum, total) {
      doc.fontSize(7).fillColor(GREY).font("Helvetica")
         .text(`${brandName} — Confidential`, ML, 780)
         .text(`Page ${pageNum} of ${total}`, 0, 780, { align: "right", width: W - MR });
    }
    function sectionTitle(text, y) {
      doc.fontSize(10).fillColor(BLACK).font("Helvetica-Bold").text(text, ML, y);
    }
    function body(text, y, opts = {}) {
      doc.fontSize(9).fillColor("#374151").font("Helvetica").text(text, ML, y, { width: W - ML - MR, ...opts });
    }

    header("MERCHANT SERVICES AGREEMENT");
    doc.fontSize(22).fillColor(BLACK).font("Helvetica-Bold").text("Merchant Services", ML, 60).text("Agreement", ML, 86);
    doc.fontSize(9).fillColor(GREY).font("Helvetica").text(`Quote ID: ${quote.quote_id}`, ML, 116).text(`Valid until: ${quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : "—"}`, ML, 128);
    hline(140);

    const clauses = [
      ["Parties", `This Merchant Services Agreement ("Agreement") is entered into between Nova Advisory Limited trading as ${brandName} ("${brandName}") and the Merchant named in Schedule A.`],
      ["Electronic Acceptance", `This Agreement may be accepted electronically through the ${brandName} quote platform. Electronic acceptance has the same legal effect as a signed written contract.`],
      ["Pricing", "The pricing proposal accepted through the quote platform constitutes Schedule A of this Agreement and is incorporated herein by reference."],
      ["Merchant Responsibilities", "The Merchant agrees to comply with all applicable laws, card scheme rules, and acquiring partner requirements at all times."],
      ["Chargebacks", "The Merchant is responsible for all chargebacks, disputes, and refunds arising from transactions processed under this Agreement."],
      ["Settlement", `Settlement occurs after ${brandName} receives cleared funds from acquiring partners. Settlement timelines may vary.`],
      ["Governing Law", "This Agreement is governed by the laws of England and Wales. The parties submit to the exclusive jurisdiction of the courts of England and Wales."],
    ];

    let y = 155;
    clauses.forEach(([title, text]) => {
      sectionTitle(title, y); y += 14;
      body(text, y);          y += doc.heightOfString(text, { width: W - ML - MR, fontSize: 9 }) + 12;
    });
    footer(1, 3);

    doc.addPage();
    header("SCHEDULE A — FEES & PRICING");
    doc.fontSize(18).fillColor(BLACK).font("Helvetica-Bold").text("Schedule A", ML, 55);
    doc.fontSize(10).fillColor(GREY).font("Helvetica").text("Fees & Pricing", ML, 78);
    hline(92);
    doc.save().rect(ML, 100, W - ML - MR, 68).fillAndStroke("#f9fafb", "#e5e5e5").restore();
    doc.fontSize(7.5).fillColor(GREY).font("Helvetica-Bold").text("MERCHANT DETAILS", ML + 10, 112);

    let dy = 126;
    [["Merchant Name", quote.merchant_name || "—"], ["Quote ID", quote.quote_id], ["Valid Until", quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : "—"]].forEach(([label, value]) => {
      doc.fontSize(8.5).fillColor(GREY).font("Helvetica").text(label + ":", ML + 10, dy);
      doc.fontSize(8.5).fillColor(BLACK).font("Helvetica-Bold").text(value, ML + 100, dy);
      dy += 14;
    });

    doc.fontSize(10).fillColor(BLACK).font("Helvetica-Bold").text("Pricing Summary", ML, 184);
    let ty = 200;
    doc.save().rect(ML, ty, W - ML - MR, 20).fill(BRAND_COLOUR).restore();
    doc.fontSize(9).fillColor("#ffffff").font("Helvetica-Bold").text("Fee Type", ML + 8, ty + 6).text("Amount", W - MR - 60, ty + 6);
    ty += 20;

    [["Card Processing Rate", `${quote.rate}%`], ["Per Transaction Fee", `${quote.fixed_fee}p`], ["Monthly Minimum", "None"], ["Monthly Platform Fee", "None"], ["PCI Compliance Fee", "None"], ["Gateway Fee", "None"]].forEach(([label, value], i) => {
      if (i % 2 === 0) doc.save().rect(ML, ty, W - ML - MR, 20).fill("#f9fafb").restore();
      doc.fontSize(9).fillColor(BLACK).font("Helvetica").text(label, ML + 8, ty + 6);
      doc.font("Helvetica-Bold").text(value, W - MR - 60, ty + 6);
      ty += 20;
    });
    footer(2, 3);

    doc.addPage();
    header("ACCEPTANCE RECORD");
    doc.fontSize(18).fillColor(BLACK).font("Helvetica-Bold").text("Acceptance Record", ML, 55);
    hline(78);
    doc.save().roundedRect(ML, 86, 180, 22, 4).fillAndStroke("#dcfce7", "#16a34a").restore();
    doc.fontSize(9).fillColor("#16a34a").font("Helvetica-Bold").text("✓  AGREEMENT ACCEPTED", ML + 10, 93);
    doc.fontSize(8.5).fillColor(GREY).font("Helvetica").text(`This record confirms that the Merchant electronically accepted the Merchant Services Agreement and Schedule A through the ${brandName} quote platform.`, ML, 120, { width: W - ML - MR });

    let ry = 158;
    doc.save().rect(ML, ry, W - ML - MR, 20).fill(BRAND_COLOUR).restore();
    doc.fontSize(9).fillColor("#ffffff").font("Helvetica-Bold").text("Field", ML + 8, ry + 6).text("Value", ML + 200, ry + 6);
    ry += 20;

    [["Quote ID", acceptance.quote_id || "—"], ["Merchant Name", acceptance.merchant_name || "—"], ["Merchant Email", acceptance.merchant_email || "—"], ["Accepted At (UTC)", acceptance.accepted_at || "—"], ["Quote Expiry", quote.expiry_date ? new Date(quote.expiry_date).toLocaleDateString() : "—"], ["IP Address", acceptance.ip_address || "—"]].forEach(([field, value], i) => {
      if (i % 2 === 0) doc.save().rect(ML, ry, W - ML - MR, 20).fill("#f9fafb").restore();
      doc.fontSize(9).fillColor(BLACK).font("Helvetica").text(field, ML + 8, ry + 6).text(value, ML + 200, ry + 6, { width: W - ML - MR - 208 });
      ry += 20;
    });
    footer(3, 3);

    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

module.exports = { generateAgreementPDF };
