import { shouldAutoReview } from '../utils/ai/autoReview.js';
import { DEFAULT_BASE_URL, DEFAULT_MODEL, readAiConfig } from '../utils/ai/config.js';
import { parsePrUrl } from '../utils/ai/githubPr.js';
import { AI_PROVIDER_IDS, AI_PROVIDER_PRESETS } from '../utils/ai/providers.js';

describe('readAiConfig', () => {
  it('AC-023/AC-027: is unavailable without a key and uses the documented defaults', () => {
    expect(readAiConfig({})).toMatchObject({ available: false, baseURL: DEFAULT_BASE_URL, model: 'qwen-plus', dailyLimit: 50, maxDiffChars: 120_000 });
  });

  it('TEST-014 AC-014/AC-027: keeps legacy DashScope provider variables out of workspace AI and reads only limits', () => {
    const config = readAiConfig({
      DASHSCOPE_API_KEY: ' sk-1 ', DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/',
      DASHSCOPE_MODEL: 'qwen3-coder-plus', AI_PROVIDER: 'deepseek', AI_API_KEY: 'sk-2',
      AI_BASE_URL: 'https://api.deepseek.com/v1', AI_MODEL: 'deepseek-chat',
      AI_REVIEW_DAILY_LIMIT: '7', AI_REVIEW_MAX_DIFF_CHARS: '50000',
    });
    expect(config).toEqual({
      available: false, apiKey: '', baseURL: DEFAULT_BASE_URL, model: DEFAULT_MODEL,
      provider: { id: 'unknown', label: 'Not configured' }, problem: 'AI_NOT_CONFIGURED',
      dailyLimit: 7, maxDiffChars: 50_000,
    });
  });

  it('TEST-027 AC-027: ignores a plain-http base URL and bad numbers', () => {
    const config = readAiConfig({ DASHSCOPE_API_KEY: 'k', DASHSCOPE_BASE_URL: 'http://evil.example/v1', AI_REVIEW_DAILY_LIMIT: '-3' });
    expect(config.baseURL).toBe(DEFAULT_BASE_URL);
    expect(config.dailyLimit).toBe(50);
  });
});

describe('workspace provider presets', () => {
  // US-009 and the workspace BYOK update replaced the environment-level provider resolution:
  // these tests keep the superseded criteria honest against the behaviour that replaced them.
  it('TEST-013 AC-013 (superseded by AC-022/AC-027): presets supply the endpoint and model, and the environment supplies neither', () => {
    expect(AI_PROVIDER_PRESETS.qwen).toMatchObject({ baseURL: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' });
    expect(AI_PROVIDER_PRESETS.deepseek).toMatchObject({ baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });

    const environmentOnly = readAiConfig({
      AI_PROVIDER: 'deepseek', AI_API_KEY: 'sk-env',
      AI_BASE_URL: 'https://api.deepseek.com/v1', AI_MODEL: 'deepseek-chat',
    });
    expect(environmentOnly).toMatchObject({
      available: false, apiKey: '', provider: { id: 'unknown' }, problem: 'AI_NOT_CONFIGURED',
    });
  });

  it('TEST-019 AC-019 (superseded by AC-022/AC-027): opencode is a workspace preset, not an environment provider', () => {
    expect(AI_PROVIDER_PRESETS.opencode).toEqual({
      id: 'opencode',
      label: 'OpenCode Console',
      baseURL: 'https://opencode.ai/inference/openai/v1',
      model: 'deepseek-v4.1-flash-free',
      requiresKey: true,
    });
    expect(readAiConfig({
      AI_PROVIDER: 'opencode', AI_API_KEY: 'sk-env', AI_MODEL: 'deepseek-v4.1-flash-free',
    })).toMatchObject({ available: false, problem: 'AI_NOT_CONFIGURED' });
  });

  it('TEST-020 AC-020 (superseded by AC-022/AC-027): openrouter is not a preset and env-only openrouter is ignored, while custom stays available', () => {
    expect(AI_PROVIDER_IDS).toEqual(['qwen', 'deepseek', 'openai', 'opencode', 'custom']);
    expect(AI_PROVIDER_IDS).not.toContain('openrouter');
    expect(AI_PROVIDER_PRESETS.custom).toMatchObject({ baseURL: '', model: '', requiresKey: true });
    expect(readAiConfig({ AI_PROVIDER: 'openrouter', AI_API_KEY: 'sk-env' })).toMatchObject({
      available: false, problem: 'AI_NOT_CONFIGURED',
    });
  });
});

describe('parsePrUrl', () => {
  it('AC-024: accepts exactly https://github.com/<owner>/<repo>/pull/<n>', () => {
    expect(parsePrUrl('https://github.com/acme/app/pull/12')).toEqual({
      owner: 'acme', repo: 'app', number: 12, fullName: 'acme/app', url: 'https://github.com/acme/app/pull/12',
    });
    expect(parsePrUrl('  https://github.com/a-b/c.d_e/pull/1  ')?.fullName).toBe('a-b/c.d_e');
  });

  it('AC-024: rejects everything else', () => {
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

  it('AC-023: reviews opened, synchronize and ready_for_review pull requests', () => {
    for (const action of ['opened', 'synchronize', 'ready_for_review']) expect(shouldAutoReview('pull_request', payload(action))).toBe(true);
  });

  it('AC-023: skips other actions, drafts, closed pull requests and other events', () => {
    for (const action of ['edited', 'closed', 'reopened', 'converted_to_draft']) expect(shouldAutoReview('pull_request', payload(action))).toBe(false);
    expect(shouldAutoReview('pull_request', payload('opened', { draft: true }))).toBe(false);
    expect(shouldAutoReview('pull_request', payload('synchronize', { state: 'closed' }))).toBe(false);
    expect(shouldAutoReview('push', payload('opened'))).toBe(false);
    expect(shouldAutoReview('pull_request', null)).toBe(false);
  });
});
