import 'dotenv/config';   // ← self-loads .env the moment this module is imported
import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Providers, in order of preference:
// 1. Resend (RESEND_API_KEY) — HTTP API, works on serverless hosts
// 2. SMTP (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)
// 3. Development only: print the email (and its links) to the console

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
// Resend's shared test sender; with it, Resend only delivers to the address of the
// Resend account owner. Verify your own domain in Resend and set EMAIL_FROM to send to anyone.
const RESEND_TEST_SENDER = 'TaskMan <onboarding@resend.dev>';

export const isResendConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** True when SMTP is configured. */
export const isSmtpConfigured = () => Boolean(process.env.EMAIL_HOST);

const toHtml = (text: string, html?: string) => html || text.replace(/\n/g, '<br />');

const sendWithResend = async ({ to, subject, text, html }: SendEmailOptions) => {
  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || RESEND_TEST_SENDER,
      to: [to],
      subject,
      text,
      html: toHtml(text, html),
    }),
  });
  if (!response.ok) {
    // Resend answers { name, message } — never includes the API key
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
  }
};

const sendWithSmtp = async ({ to, subject, text, html }: SendEmailOptions) => {
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

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    text,
    html: toHtml(text, html),
  });
};

export const sendEmail = async (options: SendEmailOptions) => {
  if (!isResendConfigured() && !isSmtpConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('No email provider configured (set RESEND_API_KEY or EMAIL_HOST).');
    }
    // Development fallback: no provider needed, the link is in the server logs
    // JSON keeps user-supplied text on one log line (no forged log entries)
    console.log('📧 [dev email]', JSON.stringify({ to: options.to, subject: options.subject, text: options.text }));
    return;
  }

  try {
    if (isResendConfigured()) await sendWithResend(options);
    else await sendWithSmtp(options);
    console.log('✅ Email sent to', JSON.stringify(options.to));
  } catch (error) {
    console.error('❌ Email send error:', (error as Error).message);
    throw error;
  }
};
