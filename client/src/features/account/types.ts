/** A signed-in device as returned by GET /api/profile/sessions. */
export interface AccountSession {
  _id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  lastLoggedIn?: string;
  current: boolean;
}

/** GET /api/profile/2fa */
export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

/** POST /api/profile/2fa/setup */
export interface TwoFactorSetup {
  /** Base32 shared secret, for manual entry */
  secret: string;
  /** otpauth:// URL that the QR code encodes */
  otpauthUrl: string;
}
