import { shouldAutoReview } from '../utils/ai/autoReview.js';
import { DEFAULT_BASE_URL, readAiConfig } from '../utils/ai/config.js';
import { parsePrUrl } from '../utils/ai/githubPr.js';

describe('readAiConfig', () => {
  it('is unavailable without a key and uses the documented defaults', () => {
    expect(readAiConfig({})).toMatchObject({ available: false, baseURL: DEFAULT_BASE_URL, model: 'qwen-plus', dailyLimit: 50, maxDiffChars: 120_000 });
  });

  it('reads the DashScope variables', () => {
    const config = readAiConfig({
      DASHSCOPE_API_KEY: ' sk-1 ', DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
      DASHSCOPE_MODEL: 'qwen3-coder-plus', AI_REVIEW_DAILY_LIMIT: '7', AI_REVIEW_MAX_DIFF_CHARS: '50000',
    });
    expect(config).toEqual({
      available: true, apiKey: 'sk-1', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3-coder-plus', dailyLimit: 7, maxDiffChars: 50_000,
    });
  });

  it('ignores a plain-http base URL and bad numbers', () => {
    const config = readAiConfig({ DASHSCOPE_API_KEY: 'k', DASHSCOPE_BASE_URL: 'http://evil.example/v1', AI_REVIEW_DAILY_LIMIT: '-3' });
    expect(config.baseURL).toBe(DEFAULT_BASE_URL);
    expect(config.dailyLimit).toBe(50);
  });
});

describe('parsePrUrl', () => {
  it('accepts exactly https://github.com/<owner>/<repo>/pull/<n>', () => {
    expect(parsePrUrl('https://github.com/acme/app/pull/12')).toEqual({
      owner: 'acme', repo: 'app', number: 12, fullName: 'acme/app', url: 'https://github.com/acme/app/pull/12',
    });
    expect(parsePrUrl('  https://github.com/a-b/c.d_e/pull/1  ')?.fullName).toBe('a-b/c.d_e');
  });

  it('rejects everything else', () => {
    for (const bad of [
      'http://github.com/acme/app/pull/12', 'https://github.com.evil.com/acme/app/pull/12', 'https://evil.com/github.com/acme/app/pull/12',
      'https://github.com/acme/app/pull/12/files', 'https://github.com/acme/app/pull/12?x=1', 'https://github.com/acme/app/pull/12#c',
      'https://github.com/acme/app/pull/0', 'https://github.com/acme/app/pull/abc', 'https://github.com/acme/app/issues/12',
      'https://user@github.com/acme/app/pull/12', 'https://github.com:444/acme/app/pull/12', 'https://github.com/../app/pull/12',
      'https://github.com/acme//pull/12', 'https://github.com/acme/app/pull/1234567890', 'javascript:alert(1)', '', null, 42,
    ]) expect(parsePrUrl(bad)).toBeNull();
  });
});

describe('shouldAutoReview', () => {
  const payload = (action: string, pr: Record<string, unknown> = {}) => ({ action, pull_request: { state: 'open', draft: false, ...pr } });

  it('reviews opened, synchronize and ready_for_review pull requests', () => {
    for (const action of ['opened', 'synchronize', 'ready_for_review']) expect(shouldAutoReview('pull_request', payload(action))).toBe(true);
  });

  it('skips other actions, drafts, closed pull requests and other events', () => {
    for (const action of ['edited', 'closed', 'reopened', 'converted_to_draft']) expect(shouldAutoReview('pull_request', payload(action))).toBe(false);
    expect(shouldAutoReview('pull_request', payload('opened', { draft: true }))).toBe(false);
    expect(shouldAutoReview('pull_request', payload('synchronize', { state: 'closed' }))).toBe(false);
    expect(shouldAutoReview('push', payload('opened'))).toBe(false);
    expect(shouldAutoReview('pull_request', null)).toBe(false);
  });
});
