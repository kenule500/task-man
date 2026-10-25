import { lookup } from 'node:dns/promises';
import { normalizeBaseURL } from '../utils/ai/providers.js';
import { isPrivateAddress, resolveSafeEndpoint } from '../utils/ai/urlGuard.js';
import { createPinnedFetch } from '../utils/ai/pinnedFetch.js';

// The resolver is replaced so the checks are deterministic and no test depends on real DNS.
jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));

const lookupMock = lookup as unknown as jest.Mock;

const codeOf = (promise: Promise<unknown>): Promise<string> =>
  promise.then(() => 'OK', (error: { code?: string }) => String(error.code));

beforeEach(() => {
  lookupMock.mockReset();
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('normalizeBaseURL (AC-029)', () => {
  it('TEST-029 AC-029: accepts an HTTPS URL and drops trailing slashes', () => {
    expect(normalizeBaseURL('  https://api.example.com/v1///  ')).toBe('https://api.example.com/v1');
    expect(normalizeBaseURL('https://api.example.com')).toBe('https://api.example.com');
  });

  it('refuses HTTP, credentials, query strings, fragments and non-URLs', () => {
    for (const value of [
      'http://api.example.com/v1',
      'https://user:secret@api.example.com/v1',
      'https://api.example.com/v1?token=1',
      'https://api.example.com/v1#fragment',
      'not a url',
      '',
    ]) {
      expect(normalizeBaseURL(value)).toBeNull();
    }
  });
});

describe('isPrivateAddress (AC-029)', () => {
  it('flags loopback, private, link-local, reserved, multicast and documentation ranges', () => {
    for (const address of [
      '0.0.0.0', '10.0.0.1', '10.255.255.255', '100.64.0.1', '127.0.0.1', '169.254.169.254',
      '172.16.0.1', '172.31.255.255', '192.0.0.1', '192.0.2.10', '192.168.1.1', '198.18.0.1',
      '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
      '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', '2001:db8::1',
      '::ffff:127.0.0.1', '::ffff:10.0.0.1',
    ]) {
      expect([address, isPrivateAddress(address)]).toEqual([address, true]);
    }
  });

  it('allows public addresses and treats unparseable values as private', () => {
    for (const address of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) {
      expect([address, isPrivateAddress(address)]).toEqual([address, false]);
    }
    expect(isPrivateAddress('localhost')).toBe(true);
  });
});

describe('resolveSafeEndpoint (AC-029)', () => {
  it('binds a public literal without asking the resolver again', async () => {
    const endpoint = await resolveSafeEndpoint('https://93.184.216.34/v1');
    expect(endpoint).toMatchObject({ address: '93.184.216.34', family: 4 });
    expect(endpoint.url.pathname).toBe('/v1');
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it('refuses every private or reserved literal before any request', async () => {
    for (const host of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.10', '169.254.169.254', '100.64.0.1', '[::1]', '[fd00::1]']) {
      expect([host, await codeOf(resolveSafeEndpoint(`https://${host}/v1`))]).toEqual([host, 'BASE_URL_PRIVATE']);
    }
  });

  it('refuses integer, hexadecimal and zero-padded spellings of loopback after URL normalisation', async () => {
    // URL turns every one of these into 127.0.0.1, which the guard then refuses as private.
    for (const host of ['2130706433', '0x7f000001', '0x7f.0.0.1', '127.000.000.001', '0177.0.0.1', '017700000001']) {
      expect([host, await codeOf(resolveSafeEndpoint(`https://${host}/v1`))]).toEqual([host, 'BASE_URL_PRIVATE']);
    }
  });

  it('refuses a name when any answer is private (DNS rebinding)', async () => {
    lookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    expect(await codeOf(resolveSafeEndpoint('https://rebind.example/v1'))).toBe('BASE_URL_PRIVATE');
  });

  it('accepts a name whose answers are all public', async () => {
    const endpoint = await resolveSafeEndpoint('https://api.example.com/v1');
    expect(endpoint).toMatchObject({ address: '93.184.216.34', family: 4 });
    expect(lookupMock).toHaveBeenCalledWith('api.example.com', { all: true, verbatim: true });
  });

  it('reports an unresolvable name instead of guessing', async () => {
    lookupMock.mockRejectedValue(new Error('ENOTFOUND'));
    expect(await codeOf(resolveSafeEndpoint('https://missing.invalid/v1'))).toBe('BASE_URL_UNRESOLVED');
    lookupMock.mockResolvedValue([]);
    expect(await codeOf(resolveSafeEndpoint('https://empty.invalid/v1'))).toBe('BASE_URL_UNRESOLVED');
  });
});

describe('createPinnedFetch (AC-029)', () => {
  it('only talks to the configured origin and path prefix, never with a query or fragment', async () => {
    const pinned = await createPinnedFetch('https://api.example.com/v1');
    await expect(pinned('https://evil.example/v1/chat/completions')).rejects.toThrow(/did not target the configured endpoint/);
    await expect(pinned('https://api.example.com:8443/v1/chat/completions')).rejects.toThrow(/did not target the configured endpoint/);
    await expect(pinned('https://api.example.com/other')).rejects.toThrow(/did not target the configured endpoint/);
    await expect(pinned('https://api.example.com/v1/chat/completions?key=1')).rejects.toThrow(/must not use query parameters or fragments/);
    await expect(pinned('https://api.example.com/v1/chat/completions#x')).rejects.toThrow(/must not use query parameters or fragments/);
  });

  it('refuses a base URL it cannot prove is public', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(createPinnedFetch('https://internal.example/v1')).rejects.toThrow(/private or reserved/);
  });
});
