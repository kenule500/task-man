import 'dotenv/config';   // ← self-loads .env the moment this module is imported
import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** True when SMTP is configured; otherwise emails are printed to the console (development). */
export const isSmtpConfigured = () => Boolean(process.env.EMAIL_HOST);

export const sendEmail = async ({ to, subject, text, html }: SendEmailOptions) => {
  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_HOST is not configured; cannot send email in production.');
    }
    // Development fallback: no SMTP needed, the link is in the server logs
    console.log(`📧 [dev email] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }

  // Create transporter lazily so env vars are always fresh
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br />'),
    });
    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error('❌ Email send error:', error);
    throw error;
  }
};
