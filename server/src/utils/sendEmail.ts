import 'dotenv/config';   // ← self-loads .env the moment this module is imported
import nodemailer from 'nodemailer';

interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export const sendEmail = async ({ to, subject, text, html }: SendEmailOptions) => {
  // Create transporter lazily so env vars are always fresh
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  console.log('📧 Sending email via:', process.env.EMAIL_HOST, 'port', process.env.EMAIL_PORT);

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