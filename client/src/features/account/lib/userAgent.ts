export type BrowserName = 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'Opera' | 'Samsung Internet' | 'Unknown browser';
export type OsName = 'Windows' | 'macOS' | 'iOS' | 'iPadOS' | 'Android' | 'Linux' | 'ChromeOS' | 'Unknown OS';
export type DeviceKind = 'desktop' | 'mobile' | 'tablet';

export interface UserAgentInfo {
  browser: BrowserName;
  os: OsName;
  device: DeviceKind;
}

// Order matters: Edge, Opera and Samsung also say "Chrome"; Chrome also says "Safari".
const BROWSERS: [RegExp, BrowserName][] = [
  [/\b(Edg|EdgA|EdgiOS|Edge)\//, 'Edge'],
  [/\b(OPR|OPT|OPiOS|Opera)\b/, 'Opera'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\b(Chrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

// Order matters: iPhone/iPad UAs say "like Mac OS X", Android UAs say "Linux", ChromeOS says "X11".
const SYSTEMS: [RegExp, OsName][] = [
  [/\b(iPhone|iPod)\b/, 'iOS'],
  [/\biPad\b/, 'iPadOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\b(Macintosh|Mac OS X)\b/, 'macOS'],
  [/\b(Linux|X11)\b/, 'Linux'],
];

/** Friendly browser, operating system and device class from a User-Agent string. */
export const describeUserAgent = (ua?: string | null): UserAgentInfo => {
  const text = ua ?? '';
  const browser = BROWSERS.find(([pattern]) => pattern.test(text))?.[1] ?? 'Unknown browser';
  const os = SYSTEMS.find(([pattern]) => pattern.test(text))?.[1] ?? 'Unknown OS';

  let device: DeviceKind = 'desktop';
  if (os === 'iPadOS') device = 'tablet';
  else if (os === 'iOS') device = 'mobile';
  else if (os === 'Android') device = /\bMobile\b/.test(text) ? 'mobile' : 'tablet';

  return { browser, os, device };
};

/** "Chrome on Windows", "Chrome", "Windows" or "Unknown device". */
export const deviceLabel = (ua?: string | null): string => {
  const { browser, os } = describeUserAgent(ua);
  const knownBrowser = browser !== 'Unknown browser';
  const knownOs = os !== 'Unknown OS';
  if (knownBrowser && knownOs) return `${browser} on ${os}`;
  if (knownBrowser) return browser;
  if (knownOs) return os;
  return 'Unknown device';
};

/** "just now", "12 min ago", "3 h ago", "2 days ago" (a date after 30 days). */
export const formatRelativeTime = (iso: string | undefined, now: Date = new Date()): string => {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? '1 day ago' : `${days} days ago`;
  return then.toLocaleDateString();
};
