/** A signed-in device as returned by GET /api/profile/sessions. */
export interface AccountSession {
  _id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: string;
  lastLoggedIn?: string;
  current: boolean;
}
