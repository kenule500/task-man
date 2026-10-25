import https from 'node:https';
import net from 'node:net';
import { resolveSafeEndpoint, type SafeEndpoint } from './urlGuard.js';

// A fetch replacement that pins the public address resolved when the client was created. It prevents
// DNS rebinding between validation and the request, refuses redirects, and only talks to the same
// origin and path prefix as the configured base URL.

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

const isRequest = (value: RequestInfo | URL): value is Request =>
  typeof value === 'object' && value !== null && 'url' in value && 'method' in value;

const bodyBuffer = async (body: BodyInit | null | undefined, request: Request | null): Promise<Buffer | undefined> => {
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') return Buffer.from(body);
    if (body instanceof URLSearchParams) return Buffer.from(body.toString());
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    if (typeof Blob !== 'undefined' && body instanceof Blob) return Buffer.from(await body.arrayBuffer());
    throw new Error('Unsupported AI request body');
  }
  if (request?.body) return Buffer.from(await request.arrayBuffer());
  return undefined;
};

const sameEndpoint = (request: URL, endpoint: SafeEndpoint): boolean => {
  if (request.origin !== endpoint.url.origin) return false;
  const basePath = endpoint.url.pathname.replace(/\/+$/, '');
  if (!basePath) return true;
  return request.pathname === basePath || request.pathname.startsWith(`${basePath}/`);
};

const requestOnce = (endpoint: SafeEndpoint, url: URL, method: string, headers: Headers, body: Buffer | undefined, signal: AbortSignal | null): Promise<Response> =>
  new Promise<Response>((resolve, reject) => {
    // URL keeps the brackets around an IPv6 literal; the socket needs it bare while Host and SNI
    // must not carry an IP as a server name.
    const host = endpoint.url.hostname.replace(/^\[|\]$/g, '');
    const hostHeader = net.isIP(host) === 6 ? `[${host}]` : host;
    const port = Number(endpoint.url.port) || 443;
    const servername = net.isIP(host) ? undefined : host;
    let settled = false;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (response: Response) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(response);
    };
    const abort = () => {
      request.destroy(new Error('The AI request was aborted'));
    };

    const request = https.request({
      protocol: 'https:',
      hostname: host,
      port,
      path: `${url.pathname}${url.search}`,
      method,
      headers: { ...Object.fromEntries(headers.entries()), host: hostHeader },
      servername,
      timeout: REQUEST_TIMEOUT_MS,
      signal: signal ?? undefined,
      // The address is already chosen and checked, so pin its family and disable the happy-eyeballs
      // path: with `autoSelectFamily` on (the Node 20+ default) Node calls this lookup with `all: true`
      // and expects an array, which would drop our single pinned address.
      family: endpoint.family,
      autoSelectFamily: false,
      lookup: (
        _hostname: string,
        _options: unknown,
        callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void,
      ) => callback(null, endpoint.address, endpoint.family),
    } as unknown as https.RequestOptions, response => {
      if (response.statusCode !== undefined && response.statusCode >= 300 && response.statusCode < 400) {
        response.resume();
        fail(new Error('The AI endpoint redirected the request'));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy();
          fail(new Error('The AI response was too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', fail);
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
        succeed(new Response(Buffer.concat(chunks), {
          status: response.statusCode ?? 502,
          statusText: response.statusMessage ?? '',
          headers: responseHeaders,
        }));
      });
    });

    request.on('error', fail);
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(new Error('The AI request timed out')));
    if (signal) {
      if (signal.aborted) {
        request.destroy(new Error('The AI request was aborted'));
      } else {
        signal.addEventListener('abort', abort, { once: true });
      }
    }
    request.end(body);
  });

export const createPinnedFetch = async (baseURL: string): Promise<typeof fetch> => {
  const endpoint = await resolveSafeEndpoint(baseURL);
  return (async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const request = isRequest(input) ? input : null;
    const url = new URL(request ? request.url : String(input));
    if (url.search || url.hash) throw new Error('The AI endpoint must not use query parameters or fragments');
    if (!sameEndpoint(url, endpoint)) throw new Error('The AI request did not target the configured endpoint');

    const method = init.method ?? request?.method ?? 'GET';
    const headers = new Headers(init.headers ?? request?.headers);
    const body = await bodyBuffer(init.body, request);
    return requestOnce(endpoint, url, method, headers, body, init.signal ?? request?.signal ?? null);
  }) as typeof fetch;
};
