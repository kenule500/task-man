import {
  base32Decode,
  base32Encode,
  buildOtpauthUrl,
  generateTotp,
  generateTotpSecret,
  hotp,
  stepAt,
  verifyTotp,
} from '../utils/totp.js';

// RFC 6238 appendix B: the shared secrets are ASCII strings, codes have 8 digits
const SHA1_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const SHA256_SECRET = base32Encode(Buffer.from('12345678901234567890123456789012'));
const SHA512_SECRET = base32Encode(Buffer.from('1234567890123456789012345678901234567890123456789012345678901234'));

describe('TOTP: RFC 6238 test vectors', () => {
  const vectors: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];

  it.each(vectors)('time %i gives the published codes for SHA-1, SHA-256 and SHA-512', (seconds, sha1, sha256, sha512) => {
    expect(generateTotp(SHA1_SECRET, seconds * 1000, 8, 'sha1')).toBe(sha1);
    expect(generateTotp(SHA256_SECRET, seconds * 1000, 8, 'sha256')).toBe(sha256);
    expect(generateTotp(SHA512_SECRET, seconds * 1000, 8, 'sha512')).toBe(sha512);
  });

  it('shows the last 6 digits with the default parameters', () => {
    expect(generateTotp(SHA1_SECRET, 59_000)).toBe('287082');
  });
});

describe('HOTP: RFC 4226 test vectors', () => {
  it('matches appendix D for the first counters', () => {
    const secret = Buffer.from('12345678901234567890');
    expect([0, 1, 2, 3, 4].map(counter => hotp(secret, counter))).toEqual(['755224', '287082', '359152', '969429', '338314']);
  });
});

describe('base32', () => {
  it('round-trips random bytes', () => {
    const bytes = Buffer.from(Array.from({ length: 20 }, (_, index) => (index * 37 + 11) % 256));
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('matches the RFC 4648 vectors (without padding)', () => {
    expect(base32Encode(Buffer.from('f'))).toBe('MY');
    expect(base32Encode(Buffer.from('fo'))).toBe('MZXQ');
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('mzxw 6ytb-oi===').toString()).toBe('foobar');
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow();
  });
});

describe('generateTotpSecret', () => {
  it('is 20 random bytes in base32 (32 characters)', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });
});

describe('verifyTotp', () => {
  const now = 1_700_000_000_000;
  const step = stepAt(now);
  const at = (offset: number) => generateTotp(SHA1_SECRET, now + offset * 30_000);

  it('accepts the current step and one step either side, and reports the step', () => {
    expect(verifyTotp(SHA1_SECRET, at(0), { timeMs: now })).toBe(step);
    expect(verifyTotp(SHA1_SECRET, at(-1), { timeMs: now })).toBe(step - 1);
    expect(verifyTotp(SHA1_SECRET, at(1), { timeMs: now })).toBe(step + 1);
  });

  it('rejects codes two or more steps away', () => {
    expect(verifyTotp(SHA1_SECRET, at(-2), { timeMs: now })).toBeNull();
    expect(verifyTotp(SHA1_SECRET, at(2), { timeMs: now })).toBeNull();
  });

  it('rejects a step that was already used (replay), but accepts a newer one', () => {
    expect(verifyTotp(SHA1_SECRET, at(0), { timeMs: now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(SHA1_SECRET, at(-1), { timeMs: now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(SHA1_SECRET, at(1), { timeMs: now, lastUsedStep: step })).toBe(step + 1);
  });

  it('ignores spaces and refuses malformed input', () => {
    const code = at(0);
    expect(verifyTotp(SHA1_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, { timeMs: now })).toBe(step);
    expect(verifyTotp(SHA1_SECRET, '12345', { timeMs: now })).toBeNull();
    expect(verifyTotp(SHA1_SECRET, '1234567', { timeMs: now })).toBeNull();
    expect(verifyTotp(SHA1_SECRET, 'abcdef', { timeMs: now })).toBeNull();
    expect(verifyTotp(SHA1_SECRET, '', { timeMs: now })).toBeNull();
  });

  it('rejects a code made with another secret', () => {
    const other = generateTotpSecret();
    expect(verifyTotp(other, at(0), { timeMs: now })).toBeNull();
  });
});

describe('buildOtpauthUrl', () => {
  it('describes a 30 second, 6 digit SHA-1 token with an escaped label', () => {
    const url = new URL(buildOtpauthUrl('JBSWY3DPEHPK3PXP', 'ana+tag@example.com', 'Task Man'));
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/Task Man:ana+tag@example.com');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      secret: 'JBSWY3DPEHPK3PXP', issuer: 'Task Man', algorithm: 'SHA1', digits: '6', period: '30',
    });
  });
});
