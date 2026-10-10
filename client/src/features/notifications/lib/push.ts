// Web Push helpers that need no React (unit tested).

/** Browsers want the VAPID public key as bytes; the server sends it base64url encoded. */
export const urlBase64ToUint8Array = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value.trim() + '='.repeat((4 - (value.trim().length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
};

/** True when this browser can show push notifications at all (iOS: only once installed to the Home Screen). */
export const isPushSupported = (): boolean =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window;

export type PushState =
  | 'checking'
  /** The browser cannot do push (or, on iOS, the app is not installed to the Home Screen). */
  | 'unsupported'
  /** The server has no VAPID keys. */
  | 'unavailable'
  /** The user blocked notifications for this site in the browser. */
  | 'denied'
  | 'off'
  | 'on';

/** The state before looking at the existing subscription. */
export const baseState = (input: {
  supported: boolean;
  serverEnabled: boolean;
  permission: NotificationPermission;
}): PushState => {
  if (!input.supported) return 'unsupported';
  if (!input.serverEnabled) return 'unavailable';
  if (input.permission === 'denied') return 'denied';
  return 'off';
};
