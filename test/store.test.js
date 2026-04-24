const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  loadCodexProviders,
  loadCodexSnapshot,
  loadCommonCodexConfig,
  loadProviders,
  loadSnapshot,
  queryJson,
} = require('../src/store/cc-switch.js');
const { loadSeloSettings, saveSeloSettings } = require('../src/store/selo-config.js');

test('loadSnapshot returns providers, common settings, and switch settings together', async () => {
  let loadProvidersArgs;
  const snapshot = await loadSnapshot({
    loadProvidersFn: (...args) => {
      loadProvidersArgs = args;
      return [{ id: 'a', name: 'A' }];
    },
    loadCommonClaudeSettingsFn: () => ({ env: { ANTHROPIC_MODEL: 'kimi-for-coding' } }),
    loadSwitchSettingsFn: async () => ({ currentProviderClaude: 'a' }),
    getFingerprintFn: async () => ({ dbMtimeMs: 1, settingsMtimeMs: 2 }),
  });

  assert.deepStrictEqual(loadProvidersArgs, []);
  assert.deepStrictEqual(snapshot, {
    providers: [{ id: 'a', name: 'A' }],
    commonSettings: { env: { ANTHROPIC_MODEL: 'kimi-for-coding' } },
    switchSettings: { currentProviderClaude: 'a' },
    fingerprint: { dbMtimeMs: 1, settingsMtimeMs: 2 },
  });
});

test('loadCodexSnapshot loads Codex providers and common config', async () => {
  const snapshot = await loadCodexSnapshot({
    loadCodexProvidersFn: () => [{ id: 'c', name: 'codex' }],
    loadCommonCodexConfigFn: () => 'model = "gpt-5.4"',
    loadSwitchSettingsFn: async () => ({ currentProviderCodex: 'c' }),
    getFingerprintFn: async () => ({ dbMtimeMs: 1 }),
  });

  assert.deepStrictEqual(snapshot, {
    providers: [{ id: 'c', name: 'codex' }],
    commonSettings: 'model = "gpt-5.4"',
    switchSettings: { currentProviderCodex: 'c' },
    fingerprint: { dbMtimeMs: 1 },
  });
});

test('loadCodexProviders queries Codex app type', () => {
  let capturedSql = '';
  const rows = loadCodexProviders({
    queryJsonFn: (sql) => {
      capturedSql = sql;
      return [{ id: 'c', name: 'Codex' }];
    },
  });

  assert.deepStrictEqual(rows, [{ id: 'c', name: 'Codex' }]);
  assert.match(capturedSql, /WHERE app_type='codex'/);
});

test('loadCommonCodexConfig returns TOML text', () => {
  const config = loadCommonCodexConfig({
    queryJsonFn: () => [{ value: 'model_reasoning_effort = "xhigh"' }],
  });

  assert.equal(config, 'model_reasoning_effort = "xhigh"');
});

test('saveSeloSettings persists lastProviderClaude and loadSeloSettings reads it back', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-config-test-'));
  const settingsPath = path.join(tempDir, 'settings.json');

  await saveSeloSettings({ lastProviderClaude: 'kimi-id' }, { settingsPath });

  const settings = await loadSeloSettings({ settingsPath });
  assert.deepStrictEqual(settings, { lastProviderClaude: 'kimi-id' });

  await fs.rm(tempDir, { recursive: true, force: true });
});

test('queryJson surfaces a clear sqlite3 missing error', () => {
  assert.throws(
    () => queryJson('SELECT 1;', {
      execFileSyncFn: () => {
        const error = new Error('spawn sqlite3 ENOENT');
        error.code = 'ENOENT';
        throw error;
      },
    }),
    /sqlite3 is required/,
  );
});
