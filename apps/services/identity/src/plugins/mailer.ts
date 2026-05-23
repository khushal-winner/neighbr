import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

/**
 * Lazily initialise the Nodemailer SMTP transporter (Gmail).
 */
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be set");
    }

    transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587", 10),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });

    console.log("[mailer] SMTP transporter ready:", host);
  }

  return transporter;
}

/**
 * Send the 6-digit postcard verification code to the user's email.
 */
export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<void> {
  const transport = getTransporter();

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || `"Neighbr" <${process.env.SMTP_USER}>`,
      to,
      subject: "Your Neighbr verification code",
      text: `Your verification code is: ${code}\n\nEnter this code in the app to complete your identity verification.\n\nThis code expires in 7 days.`,
      html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <span style="font-size: 48px;">🏘️</span>
          <h1 style="font-size: 24px; color: #111827; margin: 16px 0 8px;">Your verification code</h1>
          <p style="color: #6b7280; font-size: 14px; margin: 0;">Enter this code in Neighbr to verify your identity</p>
        </div>
        <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-family: monospace; font-size: 36px; letter-spacing: 8px; font-weight: 700; color: #111827;">${code}</span>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">This code expires in 7 days. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
    });

    console.log("[mailer] Verification email sent to", to);
  } catch (err) {
    console.error("[mailer] Failed to send email:", err);
    throw err;
  }
}