import crypto from 'crypto';
import { Request, Response } from 'express';
import User, { IUser } from '../models/userModel.js';
import Session from '../models/sessionModel.js';
import SsoState, { SSO_STATE_TTL_MS } from '../models/ssoStateModel.js';
import { getConfig } from '../config/env.js';
import {
  SsoProviderConfig, callbackUrl, getSsoProvider, getSsoProviders, isSsoProviderId,
} from '../config/sso.js';
import {
  OidcError, buildAuthorizationUrl, createPkce, exchangeCode, getDiscovery, identityFromClaims, randomToken, verifyIdToken,
  type SsoIdentity,
} from '../utils/oidc.js';
import { hashToken } from '../utils/tokens.js';
import { safeRedirectPath } from '../utils/safeRedirect.js';
import { createChallenge } from '../utils/twoFactor.js';
import { issueSession } from './authController.js';

/** The only reasons the browser is ever told about (never raw provider or server messages). */
export type SsoErrorCode =
  | 'access_denied'
  | 'invalid_state'
  | 'provider_error'
  | 'invalid_token'
  | 'email_missing'
  | 'email_unverified'
  | 'tenant_not_allowed'
  | 'account_conflict'
  | 'server_error';

const STATE_SHAPE = /^[a-f0-9]{64}$/;
const MAX_CODE_LENGTH = 4096;

const appUrl = (path: string): string => `${getConfig().clientUrl}${path}`;

/** Failure: back to the login page with a fixed code. */
const redirectWithError = (res: Response, code: SsoErrorCode): void => {
  res.setHeader('Cache-Control', 'no-store');
  res.redirect(302, appUrl(`/login?sso_error=${code}`));
};

const logFailure = (context: string, error: unknown): void => {
  // Message only: never tokens, codes, secrets or provider response bodies
  console.error(`${context}:`, error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error');
};

// ================================================================
// @desc    Providers that are configured (the web app shows a button for each)
// @route   GET /api/auth/sso/providers
// ================================================================
export const listProviders = (_req: Request, res: Response): void => {
  res.json({ providers: getSsoProviders().map(({ id, label }) => ({ id, label })) });
};

// ================================================================
// @desc    Start a sign-in: store state, PKCE verifier and nonce, then send the browser to the provider
// @route   GET /api/auth/sso/:provider/start?redirect=/relative/path
// ================================================================
export const startSso = async (req: Request, res: Response): Promise<void> => {
  const provider = getSsoProvider(req.params.provider);
  if (!provider) {
    res.status(404).json({ message: 'This sign-in method is not available.' });
    return;
  }

  let redirect: string | undefined;
  if (req.query.redirect !== undefined && req.query.redirect !== '') {
    const safe = safeRedirectPath(req.query.redirect);
    if (!safe) {
      res.status(400).json({ message: 'The redirect must be a path inside the app.' });
      return;
    }
    redirect = safe;
  }

  try {
    const discovery = await getDiscovery(provider.discoveryUrl);
    const pkce = createPkce();
    const state = randomToken(32);
    const nonce = randomToken(24);

    await SsoState.create({
      stateHash: hashToken(state),
      provider: provider.id,
      codeVerifier: pkce.verifier,
      nonce,
      redirect,
      expiresAt: new Date(Date.now() + SSO_STATE_TTL_MS),
    });

    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, buildAuthorizationUrl(discovery, {
      clientId: provider.clientId,
      redirectUri: callbackUrl(getConfig().clientUrl, provider.id),
      state,
      nonce,
      codeChallenge: pkce.challenge,
    }));
  } catch (error) {
    logFailure('sso start', error);
    res.status(502).json({ message: 'The sign-in provider could not be reached. Try again later.' });
  }
};

// ----------------------------------------------------------------
// Account resolution
// ----------------------------------------------------------------
type Resolution = { user: IUser } | { error: SsoErrorCode };

const nameFor = (identity: SsoIdentity): string =>
  (identity.name || (identity.email ?? 'TaskMan user').split('@')[0]).slice(0, 80) || 'TaskMan user';

const isDuplicateKey = (error: unknown): boolean => (error as { code?: number } | null)?.code === 11000;

/**
 * Finds the account for a verified provider identity.
 * 1. A linked (provider, subject) always wins: the subject is the stable identity, the email may change.
 * 2. Otherwise the provider must vouch for the email. It then links to the account with that email, or creates one.
 */
export const resolveSsoUser = async (provider: SsoProviderConfig, identity: SsoIdentity): Promise<Resolution> => {
  const linked = await User.findOne({
    sso: { $elemMatch: { provider: { $eq: provider.id }, subject: { $eq: identity.subject } } },
  });
  if (linked) return { user: linked };

  if (!identity.email) return { error: 'email_missing' };
  if (!identity.emailVerified) return { error: 'email_unverified' };
  const email = identity.email;
  const link = { provider: provider.id, subject: identity.subject, email, linkedAt: new Date() };

  const existing = await User.findOne({ email: { $eq: email } });
  if (existing) {
    // One identity per provider and account: a different subject of the same provider is not silently replaced
    if (existing.sso?.some(method => method.provider === provider.id)) return { error: 'account_conflict' };

    if (!existing.isVerified) {
      // Someone may have registered this address with a password they chose and never proved the address
      // (account pre-hijacking). The provider has now proven it: drop that password, tokens and sessions.
      existing.password = crypto.randomBytes(32).toString('hex');
      existing.ssoOnly = true;
      existing.isVerified = true;
      existing.verificationToken = undefined;
      existing.verificationTokenExpires = undefined;
      existing.resetPasswordToken = undefined;
      existing.resetPasswordExpires = undefined;
      await existing.save();
      await Session.updateMany({ user: existing._id }, { isValid: false });
    }

    try {
      const result = await User.updateOne(
        { _id: existing._id, 'sso.provider': { $ne: provider.id } },
        { $push: { sso: link } },
      );
      if (result.modifiedCount !== 1) return { error: 'account_conflict' };
    } catch (error) {
      if (isDuplicateKey(error)) return { error: 'account_conflict' };
      throw error;
    }
    const linkedUser = await User.findById(existing._id);
    return linkedUser ? { user: linkedUser } : { error: 'server_error' };
  }

  try {
    const created = await User.create({
      name: nameFor(identity),
      email,
      // Nobody knows this value: signing in with a password needs a reset first
      password: crypto.randomBytes(32).toString('hex'),
      isVerified: true,
      ssoOnly: true,
      sso: [link],
    });
    return { user: created };
  } catch (error) {
    if (isDuplicateKey(error)) return { error: 'account_conflict' };
    throw error;
  }
};

// ================================================================
// @desc    Provider redirects back here: finish the sign-in
// @route   GET /api/auth/sso/:provider/callback?code&state
// ================================================================
export const ssoCallback = async (req: Request, res: Response): Promise<void> => {
  const provider = getSsoProvider(req.params.provider);
  if (!provider) {
    res.status(404).json({ message: 'This sign-in method is not available.' });
    return;
  }

  try {
    const { code, state, error: providerError } = req.query;
    if (typeof state !== 'string' || !STATE_SHAPE.test(state)) {
      redirectWithError(res, 'invalid_state');
      return;
    }

    // Single use: the row is gone after this call, whatever happens next
    const pending = await SsoState.findOneAndDelete({
      stateHash: hashToken(state),
      provider: provider.id,
      expiresAt: { $gt: new Date() },
    });
    if (!pending) {
      redirectWithError(res, 'invalid_state');
      return;
    }

    // The code is always exchanged with the provider, which alone decides if it is valid: a refused sign-in,
    // a missing or oversized code becomes an empty code that the token endpoint rejects. What the request
    // contains never decides whether the check runs; it only picks the message shown afterwards.
    const authCode = typeof code === 'string' && code.length <= MAX_CODE_LENGTH ? code : '';
    const discovery = await getDiscovery(provider.discoveryUrl);
    let idToken: string;
    try {
      idToken = await exchangeCode(discovery, {
        clientId: provider.clientId,
        clientSecret: provider.clientSecret,
        code: authCode,
        redirectUri: callbackUrl(getConfig().clientUrl, provider.id),
        codeVerifier: pending.codeVerifier,
      });
    } catch (error) {
      logFailure('sso token exchange', error);
      redirectWithError(res, providerError !== undefined ? 'access_denied' : 'provider_error');
      return;
    }
    const claims = await verifyIdToken(idToken, { provider, discovery, nonce: pending.nonce });

    const resolution = await resolveSsoUser(provider, identityFromClaims(provider, claims));
    if ('error' in resolution) {
      redirectWithError(res, resolution.error);
      return;
    }
    const { user } = resolution;
    const tail = pending.redirect ? `&redirect=${encodeURIComponent(pending.redirect)}` : '';

    res.setHeader('Cache-Control', 'no-store');
    // Second step: no session until the authenticator code is accepted (same rule as the password sign-in)
    if (user.twoFactor?.enabled) {
      const challenge = await createChallenge(user._id);
      res.redirect(302, appUrl(`/login#challenge=${encodeURIComponent(challenge)}${tail}`));
      return;
    }

    const session = await issueSession(user, req);
    // The fragment never reaches a server: it stays out of access logs and Referer headers
    res.redirect(302, appUrl(`/sso/complete#token=${encodeURIComponent(session.token)}${tail}`));
  } catch (error) {
    logFailure('sso callback', error);
    if (error instanceof OidcError) {
      const byCode: Record<OidcError['code'], SsoErrorCode> = {
        discovery_failed: 'provider_error',
        jwks_failed: 'provider_error',
        token_exchange_failed: 'provider_error',
        invalid_token: 'invalid_token',
        tenant_not_allowed: 'tenant_not_allowed',
      };
      redirectWithError(res, byCode[error.code]);
      return;
    }
    redirectWithError(res, 'server_error');
  }
};

// ================================================================
// @desc    Sign-in methods linked to the signed-in account
// @route   GET /api/profile/sso
// ================================================================
export const listSsoMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user?._id).select('sso ssoOnly');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    res.json({
      methods: (user.sso ?? []).map(({ provider, email, linkedAt }) => ({ provider, email: email ?? null, linkedAt })),
      hasPassword: !user.ssoOnly,
      available: getSsoProviders().map(({ id }) => id),
    });
  } catch (error) {
    logFailure('listSsoMethods', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ================================================================
// @desc    Remove a linked sign-in method (the account must keep a password or another method)
// @route   DELETE /api/profile/sso/:provider
// ================================================================
export const unlinkSsoMethod = async (req: Request, res: Response): Promise<void> => {
  const provider = req.params.provider;
  if (!isSsoProviderId(provider)) {
    res.status(404).json({ message: 'Sign-in method not found' });
    return;
  }
  try {
    const user = await User.findById(req.user?._id).select('sso ssoOnly');
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    const methods = user.sso ?? [];
    if (!methods.some(method => method.provider === provider)) {
      res.status(404).json({ message: 'Sign-in method not found' });
      return;
    }
    if (user.ssoOnly && methods.length <= 1) {
      res.status(400).json({
        message: 'This is the only way to sign in to your account. Set a password first (use "Forgot password" on the sign-in page), then remove it.',
        code: 'LAST_SIGN_IN_METHOD',
      });
      return;
    }
    await User.updateOne({ _id: user._id }, { $pull: { sso: { provider } } });
    res.json({ message: 'Sign-in method removed' });
  } catch (error) {
    logFailure('unlinkSsoMethod', error);
    res.status(500).json({ message: 'Server error' });
  }
};
