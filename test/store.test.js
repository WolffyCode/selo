const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { loadSnapshot, queryJson } = require('../src/store/cc-switch.js');
const { loadSeloSettings, saveSeloSettings } = require('../src/store/selo-config.js');

test('loadSnapshot returns providers, common settings, and switch settings together', async () => {
  const snapshot = await loadSnapshot({
    loadProvidersFn: () => [{ id: 'a', name: 'A' }],
    loadCommonClaudeSettingsFn: () => ({ env: { ANTHROPIC_MODEL: 'kimi-for-coding' } }),
    loadSwitchSettingsFn: async () => ({ currentProviderClaude: 'a' }),
    getFingerprintFn: async () => ({ dbMtimeMs: 1, settingsMtimeMs: 2 }),
  });

  assert.deepStrictEqual(snapshot, {
    providers: [{ id: 'a', name: 'A' }],
    commonSettings: { env: { ANTHROPIC_MODEL: 'kimi-for-coding' } },
    switchSettings: { currentProviderClaude: 'a' },
    fingerprint: { dbMtimeMs: 1, settingsMtimeMs: 2 },
  });
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
