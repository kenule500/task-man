// Runs before every integration test file and BEFORE the app is imported:
// the app reads its configuration once, at import time.
import crypto from 'crypto';

const randomDb = `taskman_it_${crypto.randomBytes(5).toString('hex')}`;
const LOCAL_HOST = /^mongodb:\/\/(?:[^@/]+@)?(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:[/?]|$)/i;

/** Keeps host/credentials/options of the given URI but swaps the database name. */
const withDatabase = (uri: string, database: string): string => {
  const match = /^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/[^?]*)?(\?.*)?$/i.exec(uri);
  return match ? `${match[1]}/${database}${match[2] ?? ''}` : `mongodb://127.0.0.1:27017/${database}`;
};

// CI provides a service container; elsewhere only a local mongod is ever used
// (never a shared Atlas database that happens to be in the shell environment).
const provided = process.env.MONGO_URI;
const base = provided && (process.env.CI || LOCAL_HOST.test(provided)) ? provided : 'mongodb://127.0.0.1:27017';

process.env.MONGO_URI = withDatabase(base, randomDb);
process.env.JWT_SECRET = process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
  ? process.env.JWT_SECRET
  : crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.RATE_LIMIT_MAX = '10000';
process.env.TRUST_PROXY = '';
process.env.DEV_AUTO_VERIFY = 'false';
// Empty (but defined) so dotenv never fills it from server/.env: emails are captured below
process.env.EMAIL_HOST = '';

export interface CapturedEmail {
  to: string;
  subject: string;
  text: string;
}

const emails: CapturedEmail[] = [];
(globalThis as { __sentEmails?: CapturedEmail[] }).__sentEmails = emails;

jest.mock('../utils/sendEmail.js', () => ({
  __esModule: true,
  isSmtpConfigured: () => false,
  sendEmail: async (message: CapturedEmail) => {
    emails.push({ to: message.to, subject: message.subject, text: message.text });
  },
}));

// The controllers log every email, boot step and handled 500: keep the output readable
// (set IT_VERBOSE=1 to see it while debugging).
if (!process.env.IT_VERBOSE) {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
}
