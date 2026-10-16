/** curl example for the "How to use" panel (the placeholder is not a real token). */
import i18n from '@/i18n';

export const curlSnippet = (apiUrl: string, slug: string): string =>
  `curl -H "Authorization: Bearer tm_…" ${apiUrl.replace(/\/$/, '')}/workspaces/${slug}/tasks`;

/** Node example that verifies the X-TaskMan-Signature header against the raw request body. */
export const verifySnippet = (): string => [
  "import crypto from 'node:crypto';",
  '',
  '// rawBody: the request body exactly as received (a string or Buffer, before JSON.parse)',
  'function isFromTaskMan(rawBody, signatureHeader, secret) {',
  "  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');",
  '  const a = Buffer.from(expected);',
  '  const b = Buffer.from(signatureHeader ?? \'\');',
  '  return a.length === b.length && crypto.timingSafeEqual(a, b);',
  '}',
].join('\n');

/** "Expires in 29 days" / "Expired" / "Never expires". */
export const describeExpiry = (expiresAt: string | null, now: Date = new Date()): string => {
  if (!expiresAt) return i18n.t('admin:developers.neverExpires');
  const time = new Date(expiresAt).getTime();
  if (Number.isNaN(time)) return '';
  const days = Math.ceil((time - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return i18n.t('admin:developers.expired');
  return i18n.t('admin:developers.expiresIn', { count: days });
};
