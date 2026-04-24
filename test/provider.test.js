const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCodexSubText,
  normalizeProviderSettings,
  resolveDefaultProviderId,
  resolveDefaultProviderIdByKeys,
  resolveEffectiveSettings,
} = require('../src/core/provider.js');

test('resolveDefaultProviderId prefers currentProviderClaude over selo local state', () => {
  const rows = [
    { id: 'a', is_current: 0 },
    { id: 'b', is_current: 1 },
    { id: 'c', is_current: 0 },
  ];

  assert.equal(
    resolveDefaultProviderId(rows, { currentProviderClaude: 'a' }, { lastProviderClaude: 'c' }),
    'a',
  );
});

test('resolveDefaultProviderId supports Codex provider state keys', () => {
  const rows = [
    { id: 'claude-id', is_current: 0 },
    { id: 'codex-id', is_current: 0 },
  ];

  assert.equal(
    resolveDefaultProviderIdByKeys(
      rows,
      { currentProviderCodex: 'codex-id' },
      { lastProviderCodex: 'claude-id' },
      {
        currentProviderKey: 'currentProviderCodex',
        lastProviderKey: 'lastProviderCodex',
      },
    ),
    'codex-id',
  );
});

test('resolveDefaultProviderId falls back to is_current then selo local state then first row', () => {
  assert.equal(
    resolveDefaultProviderId([{ id: 'a', is_current: 0 }, { id: 'b', is_current: 1 }], {}, {}),
    'b',
  );
  assert.equal(
    resolveDefaultProviderId([{ id: 'a', is_current: 0 }, { id: 'b', is_current: 0 }], {}, { lastProviderClaude: 'b' }),
    'b',
  );
  assert.equal(
    resolveDefaultProviderId([{ id: 'a', is_current: 0 }, { id: 'b', is_current: 0 }], {}, {}),
    'a',
  );
  assert.equal(resolveDefaultProviderId([], {}, {}), null);
});

test('resolveEffectiveSettings merges common config when enabled', () => {
  const settings = resolveEffectiveSettings(
    {
      name: 'Kimi',
      meta: JSON.stringify({ commonConfigEnabled: true }),
      settings_config: JSON.stringify({
        env: {
          ANTHROPIC_REASONING_MODEL: 'kimi-for-coding',
        },
        skipDangerousModePermissionPrompt: true,
      }),
    },
    {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'kimi-token',
        ANTHROPIC_BASE_URL: 'https://api.kimi.com/coding/',
        ANTHROPIC_MODEL: 'kimi-for-coding',
      },
      includeCoAuthoredBy: false,
    },
  );

  assert.deepStrictEqual(settings, {
    env: {
      ANTHROPIC_AUTH_TOKEN: 'kimi-token',
      ANTHROPIC_BASE_URL: 'https://api.kimi.com/coding/',
      ANTHROPIC_MODEL: 'kimi-for-coding',
      ANTHROPIC_REASONING_MODEL: 'kimi-for-coding',
    },
    includeCoAuthoredBy: false,
    skipDangerousModePermissionPrompt: true,
    model: 'kimi-for-coding',
  });
});

test('normalizeProviderSettings backfills preferred model into env', () => {
  const settings = normalizeProviderSettings({
    env: {
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.1',
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
    },
  });

  assert.equal(settings.model, 'glm-5.1');
  assert.equal(settings.env.ANTHROPIC_MODEL, 'glm-5.1');
  assert.equal(settings.env.ANTHROPIC_REASONING_MODEL, 'glm-5.1');
});

test('getCodexSubText prefers CC Switch notes over config details', () => {
  assert.equal(
    getCodexSubText({
      notes: 'fast shared codex provider',
      settings_config: JSON.stringify({
        config: 'model = "gpt-5.4"\nbase_url = "https://example.com"',
      }),
    }),
    'fast shared codex provider',
  );
});
