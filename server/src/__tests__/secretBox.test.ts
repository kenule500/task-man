import { decryptSecret, defaultKeyMaterial, deriveKey, encryptSecret } from '../utils/secretBox.js';
import {
  findRecoveryCodeHash,
  generateRecoveryCodes,
  hashRecoveryCodes,
  normalizeRecoveryCode,
} from '../utils/recoveryCodes.js';

const KEY = 'k'.repeat(40);

describe('secretBox (AES-256-GCM)', () => {
  it('round-trips a secret and never stores it in the clear', () => {
    const box = encryptSecret('JBSWY3DPEHPK3PXP', 'user-1', KEY);
    expect(box).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(box).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(box, 'user-1', KEY)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh IV, so the same secret encrypts differently each time', () => {
    expect(encryptSecret('same', 'ctx', KEY)).not.toBe(encryptSecret('same', 'ctx', KEY));
  });

  it('fails for another key, another context or a modified value', () => {
    const box = encryptSecret('secret', 'user-1', KEY);
    expect(() => decryptSecret(box, 'user-1', 'x'.repeat(40))).toThrow();
    expect(() => decryptSecret(box, 'user-2', KEY)).toThrow();
    const [version, iv, tag, data] = box.split('.');
    const flipped = `${data.slice(0, -2)}${data.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(() => decryptSecret([version, iv, tag, flipped].join('.'), 'user-1', KEY)).toThrow();
    expect(() => decryptSecret('not-a-box', 'user-1', KEY)).toThrow();
  });

  it('derives a 32 byte key that depends on the key material', () => {
    expect(deriveKey(KEY)).toHaveLength(32);
    expect(deriveKey(KEY).equals(deriveKey(KEY))).toBe(true);
    expect(deriveKey(KEY).equals(deriveKey(`${KEY}!`))).toBe(false);
  });

  it('prefers TWO_FACTOR_KEY and falls back to JWT_SECRET', () => {
    const saved = { two: process.env.TWO_FACTOR_KEY, jwt: process.env.JWT_SECRET };
    try {
      process.env.JWT_SECRET = 'jwt-secret-for-the-test-aaaaaaaaaaaaaaaa';
      delete process.env.TWO_FACTOR_KEY;
      expect(defaultKeyMaterial()).toBe(process.env.JWT_SECRET);
      process.env.TWO_FACTOR_KEY = 'dedicated-key';
      expect(defaultKeyMaterial()).toBe('dedicated-key');
      delete process.env.JWT_SECRET;
      delete process.env.TWO_FACTOR_KEY;
      expect(() => defaultKeyMaterial()).toThrow();
    } finally {
      if (saved.two === undefined) delete process.env.TWO_FACTOR_KEY; else process.env.TWO_FACTOR_KEY = saved.two;
      if (saved.jwt === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = saved.jwt;
    }
  });
});

describe('recovery codes', () => {
  it('makes 10 distinct codes shaped xxxx-xxxx', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-hj-km-np-z2-9]{4}-[a-hj-km-np-z2-9]{4}$/);
  });

  it('normalizes case, spaces and a missing dash; refuses other shapes', () => {
    expect(normalizeRecoveryCode('ABCD EFGH')).toBe('abcd-efgh');
    expect(normalizeRecoveryCode('abcdefgh')).toBe('abcd-efgh');
    expect(normalizeRecoveryCode('abcd-efg')).toBeNull();
    expect(normalizeRecoveryCode('')).toBeNull();
  });

  it('stores bcrypt hashes and finds the matching one', async () => {
    const codes = generateRecoveryCodes(3);
    const hashes = await hashRecoveryCodes(codes);
    expect(hashes[0]).toMatch(/^\$2[aby]\$/);
    expect(hashes[0]).not.toContain(codes[0]);
    expect(await findRecoveryCodeHash(codes[1].toUpperCase(), hashes)).toBe(hashes[1]);
    expect(await findRecoveryCodeHash('zzzz-zzzz', hashes)).toBeNull();
    expect(await findRecoveryCodeHash('nonsense', hashes)).toBeNull();
  });
});
