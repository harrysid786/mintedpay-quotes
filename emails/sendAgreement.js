const nodemailer = require("nodemailer");

async function sendAgreementEmail(quote, pdfPath) {
  let transporter;

  if (process.env.USE_ETHEREAL === "true") {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log("📧  Using Ethereal test account:", testAccount.user);
  } else {
    transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth:   { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  const brandName = (() => {
    try {
      const b = typeof quote.brand === "string" ? JSON.parse(quote.brand) : quote.brand;
      return b?.name || "Minted Pay";
    } catch (_) { return "Minted Pay"; }
  })();

  const info = await transporter.sendMail({
    from:    process.env.SMTP_FROM || `"${brandName}" <noreply@mintedpay.com>`,
    to:      quote.merchant_email,
    subject: `${brandName} Merchant Agreement Confirmation`,
    text:    `Dear ${quote.merchant_name},\n\nThank you for accepting the ${brandName} payment processing proposal.\n\nQuote ID: ${quote.quote_id}\nRate: ${quote.rate}% + ${quote.fixed_fee}p per transaction\n\nPlease find attached your completed Merchant Services Agreement.\n\nKind regards,\nThe ${brandName} Team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <div style="background:#4F35F3;padding:20px 24px;border-radius:6px 6px 0 0">
          <h2 style="color:#fff;margin:0;font-size:18px">${brandName}</h2>
        </div>
        <div style="border:1px solid #e5e5e5;border-top:none;padding:28px 24px;border-radius:0 0 6px 6px">
          <p>Dear <strong>${quote.merchant_name}</strong>,</p>
          <p>Thank you for accepting the ${brandName} payment processing proposal.</p>
          <table style="border-collapse:collapse;margin:16px 0;width:100%">
            <tr style="background:#f9fafb"><td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:bold">Quote ID</td><td style="padding:8px 12px;border:1px solid #e5e5e5">${quote.quote_id}</td></tr>
            <tr><td style="padding:8px 12px;border:1px solid #e5e5e5;font-weight:bold">Rate</td><td style="padding:8px 12px;border:1px solid #e5e5e5">${quote.rate}% + ${quote.fixed_fee}p</td></tr>
          </table>
          <p>Please find attached your completed Merchant Services Agreement.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:24px">Kind regards,<br>The ${brandName} Team</p>
        </div>
      </div>`,
    attachments: [{ filename: `Merchant_Agreement_${quote.quote_id}.pdf`, path: pdfPath }],
  });

  if (process.env.USE_ETHEREAL === "true") {
    console.log("📬  Preview URL:", nodemailer.getTestMessageUrl(info));
  }
  console.log(`✅  Email sent to ${quote.merchant_email}`);
  return info;
}

module.exports = { sendAgreementEmail };
