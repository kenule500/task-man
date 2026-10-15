import { buildPayload, generateWebhookSecret, matchesEvent, signBody, verifySignature } from '../utils/webhooks/payload.js';
import { checkWebhookUrl, isBlockedAddress, resolvePublicAddresses, validateWebhookTarget } from '../utils/webhooks/ssrf.js';

describe('webhook signing', () => {
  it('generates whsec_ secrets of 32 characters', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{32}$/);
    expect(generateWebhookSecret()).not.toBe(secret);
  });

  it('signs the raw body and verifies it in constant time', () => {
    const header = signBody('whsec_abc', '{"a":1}');
    expect(header).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature('whsec_abc', '{"a":1}', header)).toBe(true);
    expect(verifySignature('whsec_abc', '{"a":2}', header)).toBe(false);
    expect(verifySignature('whsec_other', '{"a":1}', header)).toBe(false);
    expect(verifySignature('whsec_abc', '{"a":1}', undefined)).toBe(false);
    expect(verifySignature('whsec_abc', '{"a":1}', 'sha256=short')).toBe(false);
  });
});

describe('event matching and payload', () => {
  it('matches * and listed events only', () => {
    expect(matchesEvent(['*'], 'task.created')).toBe(true);
    expect(matchesEvent(['task.created'], 'task.created')).toBe(true);
    expect(matchesEvent(['task.created'], 'task.deleted')).toBe(false);
  });

  it('keeps the body storable even with many large changes', () => {
    const changes = Array.from({ length: 60 }, (_, i) => ({ field: `f${i}`, from: 'x'.repeat(200), to: 'y'.repeat(200) }));
    const payload = buildPayload({
      deliveryId: 'id', event: 'task.updated', createdAt: new Date('2030-01-01T00:00:00Z'), workspaceSlug: 'acme',
      actor: { id: '1', name: 'Ann' }, summary: 'Task', changes,
    });
    expect(payload.changes.length).toBeLessThanOrEqual(20);
    expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(8 * 1024);
    expect(payload).toMatchObject({ id: 'id', event: 'task.updated', workspace: { slug: 'acme' }, actor: { id: '1', name: 'Ann' } });
    expect(payload.task).toBeUndefined();
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0', '10.1.2.3', '100.64.0.1', '100.127.255.255', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:7f00:1',
    '64:ff9b::a00:1', '2002:7f00:1::1', '2001:db8::1',
  ])('blocks %s', address => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '100.63.255.255', '172.15.0.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])(
    'allows %s', address => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );

  it('treats garbage as blocked', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('checkWebhookUrl', () => {
  const prod = { production: true };
  const dev = { production: false };

  it('requires https in production', () => {
    expect(checkWebhookUrl('http://example.com/hook', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://example.com/hook', prod).ok).toBe(true);
    expect(checkWebhookUrl('ftp://example.com/hook', dev).ok).toBe(false);
    expect(checkWebhookUrl('http://example.com/hook', dev).ok).toBe(true);
  });

  it('rejects credentials, odd ports, private literals and local names in production', () => {
    expect(checkWebhookUrl('https://user:pw@example.com/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://example.com:8443/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://example.com:8080/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://127.0.0.1/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://169.254.169.254/latest/meta-data', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://[::1]/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://[fd00::1]/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://localhost/', prod).ok).toBe(false);
    expect(checkWebhookUrl('https://db.internal/', prod).ok).toBe(false);
  });

  it('allows 8080 and 3000 and local receivers outside production', () => {
    expect(checkWebhookUrl('http://example.com:8080/', dev).ok).toBe(true);
    expect(checkWebhookUrl('http://example.com:3000/', dev).ok).toBe(true);
    expect(checkWebhookUrl('http://example.com:9999/', dev).ok).toBe(false);
    expect(checkWebhookUrl('http://127.0.0.1:41234/hook', dev).ok).toBe(true);
  });

  it('rejects empty, malformed and oversized input', () => {
    expect(checkWebhookUrl('', dev).ok).toBe(false);
    expect(checkWebhookUrl('nope', dev).ok).toBe(false);
    expect(checkWebhookUrl(42, dev).ok).toBe(false);
    expect(checkWebhookUrl(`https://example.com/${'a'.repeat(2000)}`, prod).ok).toBe(false);
  });
});

describe('resolvePublicAddresses and validateWebhookTarget', () => {
  const lookupTo = (...addresses: string[]) => async () => addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 }));

  it('rejects hosts that resolve to private addresses in production', async () => {
    await expect(resolvePublicAddresses('evil.example', { production: true, lookup: lookupTo('10.0.0.5') })).rejects.toThrow(/private/);
    await expect(resolvePublicAddresses('evil.example', { production: true, lookup: lookupTo('93.184.216.34', '127.0.0.1') })).rejects.toThrow();
    await expect(resolvePublicAddresses('evil.example', { production: true, lookup: lookupTo('fd00::1') })).rejects.toThrow();
  });

  it('accepts public hosts and skips the check outside production', async () => {
    await expect(resolvePublicAddresses('ok.example', { production: true, lookup: lookupTo('93.184.216.34') })).resolves.toHaveLength(1);
    await expect(resolvePublicAddresses('localhost', { production: false, lookup: lookupTo('127.0.0.1') })).resolves.toHaveLength(1);
  });

  it('rejects a private IP literal and an unresolvable host in production', async () => {
    expect(await validateWebhookTarget('https://192.168.0.10/hook', { production: true })).toMatch(/not reachable/);
    expect(await validateWebhookTarget('https://ok.example/hook', { production: true, lookup: lookupTo('10.0.0.1') })).toMatch(/private/);
    expect(await validateWebhookTarget('https://ok.example/hook', { production: true, lookup: async () => [] })).toMatch(/resolve/);
    expect(await validateWebhookTarget('https://ok.example/hook', { production: true, lookup: lookupTo('93.184.216.34') })).toBeNull();
  });
});
