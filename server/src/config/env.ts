// Central, validated access to environment variables.
// The server refuses to start in production with missing or weak secrets.

const WEAK_SECRETS = new Set(['secret', 'supersecretkey', 'changeme', 'your_jwt_secret', 'jwt_secret']);
const MIN_SECRET_LENGTH = 32;

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  mongoUri: string;
  jwtSecret: string;
  /** Public URL of the web app, used in email links */
  clientUrl: string;
  /** Origins allowed by CORS */
  corsOrigins: string[];
  rateLimitMax: number;
  /** Number of reverse proxies in front of the API (Render, Railway, Nginx...) */
  trustProxy: number;
}

export interface ConfigCheck {
  config: AppConfig;
  errors: string[];
  warnings: string[];
}

const splitList = (value: string | undefined) =>
  (value ?? '').split(',').map(item => item.trim().replace(/\/$/, '')).filter(Boolean);

/** Parses and validates an environment object (pure, so it can be unit tested). */
export const readConfig = (source: NodeJS.ProcessEnv): ConfigCheck => {
  const nodeEnv = source.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const clientUrl = (source.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  const corsOrigins = splitList(source.CORS_ORIGIN);

  const config: AppConfig = {
    nodeEnv,
    isProduction,
    port: Number(source.PORT) || 5000,
    mongoUri: source.MONGO_URI || '',
    jwtSecret: source.JWT_SECRET || '',
    clientUrl,
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : [clientUrl],
    rateLimitMax: Number(source.RATE_LIMIT_MAX) || 500,
    trustProxy: Number(source.TRUST_PROXY) || 0,
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.mongoUri) errors.push('MONGO_URI is required.');

  const secretProblem = !config.jwtSecret
    ? 'JWT_SECRET is required.'
    : WEAK_SECRETS.has(config.jwtSecret.toLowerCase()) || config.jwtSecret.length < MIN_SECRET_LENGTH
      ? `JWT_SECRET is weak: use at least ${MIN_SECRET_LENGTH} random characters (e.g. \`openssl rand -hex 32\`).`
      : null;
  if (secretProblem) (isProduction || !config.jwtSecret ? errors : warnings).push(secretProblem);

  if (isProduction && !source.CLIENT_URL) errors.push('CLIENT_URL is required in production (used in email links and CORS).');

  return { config, errors, warnings };
};

let cached: AppConfig | null = null;

/**
 * Validated configuration from `process.env`, computed once.
 * Exits with a clear message on fatal problems (call it first in server.ts).
 */
export const getConfig = (): AppConfig => {
  if (cached) return cached;
  const { config, errors, warnings } = readConfig(process.env);
  warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
  if (errors.length > 0) {
    errors.forEach(error => console.error(`❌ ${error}`));
    console.error('Fix the environment (see server/.env.example) and restart.');
    process.exit(1);
  }
  cached = config;
  return config;
};
