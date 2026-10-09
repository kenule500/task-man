import { describeUserAgent, deviceLabel, formatRelativeTime } from '../lib/userAgent';

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  edgeAndroid: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  safariIpad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  chromeAndroidTablet: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  operaWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0',
  chromeOs: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

describe('describeUserAgent', () => {
  it.each([
    ['Chrome on Windows', UA.chromeWin, { browser: 'Chrome', os: 'Windows', device: 'desktop' }],
    ['Edge before Chrome', UA.edgeWin, { browser: 'Edge', os: 'Windows', device: 'desktop' }],
    ['Edge on Android', UA.edgeAndroid, { browser: 'Edge', os: 'Android', device: 'mobile' }],
    ['Firefox on Linux', UA.firefoxLinux, { browser: 'Firefox', os: 'Linux', device: 'desktop' }],
    ['Safari on macOS', UA.safariMac, { browser: 'Safari', os: 'macOS', device: 'desktop' }],
    ['Safari on iPhone is iOS, not macOS', UA.safariIphone, { browser: 'Safari', os: 'iOS', device: 'mobile' }],
    ['Chrome on iPhone', UA.chromeIphone, { browser: 'Chrome', os: 'iOS', device: 'mobile' }],
    ['Firefox on iPhone', UA.firefoxIphone, { browser: 'Firefox', os: 'iOS', device: 'mobile' }],
    ['Safari on iPad', UA.safariIpad, { browser: 'Safari', os: 'iPadOS', device: 'tablet' }],
    ['Chrome on Android phone is Android, not Linux', UA.chromeAndroid, { browser: 'Chrome', os: 'Android', device: 'mobile' }],
    ['Chrome on Android tablet', UA.chromeAndroidTablet, { browser: 'Chrome', os: 'Android', device: 'tablet' }],
    ['Samsung Internet before Chrome', UA.samsung, { browser: 'Samsung Internet', os: 'Android', device: 'mobile' }],
    ['Opera before Chrome', UA.operaWin, { browser: 'Opera', os: 'Windows', device: 'desktop' }],
    ['Chrome on ChromeOS is not Linux', UA.chromeOs, { browser: 'Chrome', os: 'ChromeOS', device: 'desktop' }],
    ['Chrome on macOS is Chrome, not Safari', UA.chromeMac, { browser: 'Chrome', os: 'macOS', device: 'desktop' }],
    ['Chrome on Linux', UA.chromeLinux, { browser: 'Chrome', os: 'Linux', device: 'desktop' }],
  ])('%s', (_name, ua, expected) => {
    expect(describeUserAgent(ua)).toEqual(expected);
  });

  it.each([[''], [undefined], [null], ['curl/8.4.0'], ['PostmanRuntime/7.37']])('falls back for %p', (ua) => {
    expect(describeUserAgent(ua)).toEqual({ browser: 'Unknown browser', os: 'Unknown OS', device: 'desktop' });
  });
});

describe('deviceLabel', () => {
  it('joins browser and OS', () => {
    expect(deviceLabel(UA.chromeWin)).toBe('Chrome on Windows');
    expect(deviceLabel(UA.safariIphone)).toBe('Safari on iOS');
  });

  it('degrades gracefully when one part is unknown', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
    expect(deviceLabel('curl/8.4.0')).toBe('Unknown device');
    expect(deviceLabel('Mozilla/5.0 Firefox/127.0')).toBe('Firefox');
    expect(deviceLabel('')).toBe('Unknown device');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-09T12:00:00.000Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it.each([
    [20 * 1000, 'just now'],
    [12 * 60 * 1000, '12 min ago'],
    [3 * 3600 * 1000, '3 h ago'],
    [24 * 3600 * 1000, '1 day ago'],
    [5 * 24 * 3600 * 1000, '5 days ago'],
  ])('%d ms ago', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), now)).toBe(expected);
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(formatRelativeTime(undefined, now)).toBe('');
    expect(formatRelativeTime('nope', now)).toBe('');
  });
});
