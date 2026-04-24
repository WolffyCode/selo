const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  buildVersionString,
  parseCliArgs,
  reconcileSelection,
  run,
} = require('../src/cli.js');

test('reconcileSelection keeps the same provider selected when it still exists', () => {
  const nextId = reconcileSelection(
    'b',
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    { currentProviderClaude: 'a' },
    {},
  );

  assert.equal(nextId, 'b');
});

test('reconcileSelection falls back to currentProviderClaude when the selected provider is removed', () => {
  const nextId = reconcileSelection(
    'b',
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'a' }, { id: 'c' }],
    { currentProviderClaude: 'a' },
    { lastProviderClaude: 'c' },
  );

  assert.equal(nextId, 'a');
});

test('parseCliArgs maps explicit claude args correctly', () => {
  assert.deepStrictEqual(parseCliArgs(['claude', '-d', '--print', 'hi']), {
    showVersion: false,
    danger: true,
    claudeArgs: ['--print', 'hi'],
  });
  assert.deepStrictEqual(parseCliArgs(['-v']), {
    showVersion: true,
    danger: false,
    claudeArgs: [],
  });
});

test('buildVersionString formats the selo version output', () => {
  assert.equal(buildVersionString('1.2.3'), 'selo v1.2.3');
});

test('run launches codex mode with a temporary Codex launch plan', async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};

  const stdout = { write: () => {} };
  const stderr = { write: () => {} };
  const child = new EventEmitter();
  child.kill = () => {};

  let loadSnapshotArgs;
  let loadProviderArgs;
  let savedSettings;
  let codexLaunchInput;
  let spawnInput;
  let cleanupCalled = false;

  const exitPromise = run(['codex', '--search'], {
    stdin,
    stdout,
    stderr,
    loadCodexSnapshotFn: async (...args) => {
      loadSnapshotArgs = args;
      return {
        providers: [{
          id: 'codex-id',
          name: 'Codex Provider',
          settings_config: JSON.stringify({ config: 'model = "gpt-5.4"' }),
          meta: '{}',
          is_current: 0,
        }],
        commonSettings: 'model_reasoning_effort = "high"',
        switchSettings: { currentProviderCodex: 'codex-id' },
        fingerprint: {},
      };
    },
    loadCodexProviderByIdFn: (id, ...args) => {
      loadProviderArgs = { id, args };
      return {
        id,
        name: 'Codex Provider',
        settings_config: JSON.stringify({ config: 'model = "gpt-5.4"' }),
        meta: '{}',
      };
    },
    loadCommonCodexConfigFn: () => 'model_reasoning_effort = "high"',
    loadCommonClaudeSettingsFn: () => {
      throw new Error('Claude common settings should not be read in codex mode.');
    },
    loadSeloSettingsFn: async () => ({}),
    saveSeloSettingsFn: async (settings) => {
      savedSettings = settings;
    },
    createSnapshotWatcherFn: () => ({ close() {} }),
    assertCodexAvailableFn: () => {},
    assertClaudeAvailableFn: () => {
      throw new Error('Claude availability should not be checked in codex mode.');
    },
    createCodexLaunchPlanFn: async (input) => {
      codexLaunchInput = input;
      return {
        command: 'codex',
        args: input.codexArgs,
        env: { CODEX_HOME: '/tmp/selo-codex-test' },
        cleanup: async () => {
          cleanupCalled = true;
        },
      };
    },
    createLaunchPlanFn: async () => {
      throw new Error('Claude launch plan should not be created in codex mode.');
    },
    spawnFn: (command, args, options) => {
      spawnInput = { command, args, options };
      setImmediate(() => child.emit('exit', 0, null));
      return child;
    },
  });

  setImmediate(() => stdin.emit('keypress', '', { name: 'return' }));

  assert.equal(await exitPromise, 0);
  assert.deepStrictEqual(loadSnapshotArgs, []);
  assert.deepStrictEqual(loadProviderArgs, {
    id: 'codex-id',
    args: [],
  });
  assert.deepStrictEqual(savedSettings, { lastProviderCodex: 'codex-id' });
  assert.equal(codexLaunchInput.commonConfig, 'model_reasoning_effort = "high"');
  assert.deepStrictEqual(codexLaunchInput.codexArgs, ['--search']);
  assert.deepStrictEqual(spawnInput, {
    command: 'codex',
    args: ['--search'],
    options: {
      stdio: 'inherit',
      env: { CODEX_HOME: '/tmp/selo-codex-test' },
    },
  });
  assert.equal(cleanupCalled, true);
});

test('run launches explicit claude mode', async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  stdin.resume = () => {};
  stdin.pause = () => {};

  const stdout = { write: () => {} };
  const stderr = { write: () => {} };
  const child = new EventEmitter();

  let loadSnapshotArgs;
  let loadProviderArgs;
  let savedSettings;
  let claudeLaunchInput;
  let spawnInput;
  let cleanupCalled = false;

  const exitPromise = run(['claude', '-d', '--print', 'hi'], {
    stdin,
    stdout,
    stderr,
    loadSnapshotFn: async (...args) => {
      loadSnapshotArgs = args;
      return {
        providers: [{
          id: 'claude-id',
          name: 'Claude Provider',
          settings_config: JSON.stringify({ env: {} }),
          meta: '{}',
          is_current: 0,
        }],
        commonSettings: {},
        switchSettings: { currentProviderClaude: 'claude-id' },
        fingerprint: {},
      };
    },
    loadProviderByIdFn: (id, ...args) => {
      loadProviderArgs = { id, args };
      return {
        id,
        name: 'Claude Provider',
        settings_config: JSON.stringify({ env: {} }),
        meta: '{}',
      };
    },
    loadCommonClaudeSettingsFn: () => ({}),
    loadSeloSettingsFn: async () => ({}),
    saveSeloSettingsFn: async (settings) => {
      savedSettings = settings;
    },
    createSnapshotWatcherFn: () => ({ close() {} }),
    assertClaudeAvailableFn: () => {},
    createLaunchPlanFn: async (input) => {
      claudeLaunchInput = input;
      return {
        command: 'claude',
        args: ['--dangerously-skip-permissions', '--print', 'hi'],
        env: { TEST: '1' },
        cleanup: async () => {
          cleanupCalled = true;
        },
      };
    },
    createCodexLaunchPlanFn: async () => {
      throw new Error('Codex launch plan should not be created in default Claude mode.');
    },
    spawnFn: (command, args, options) => {
      spawnInput = { command, args, options };
      setImmediate(() => child.emit('exit', 0, null));
      return child;
    },
  });

  setImmediate(() => stdin.emit('keypress', '', { name: 'return' }));

  assert.equal(await exitPromise, 0);
  assert.deepStrictEqual(loadSnapshotArgs, []);
  assert.deepStrictEqual(loadProviderArgs, { id: 'claude-id', args: [] });
  assert.deepStrictEqual(savedSettings, { lastProviderClaude: 'claude-id' });
  assert.deepStrictEqual(claudeLaunchInput, {
    provider: {
      id: 'claude-id',
      name: 'Claude Provider',
      settings_config: JSON.stringify({ env: {} }),
      meta: '{}',
    },
    commonSettings: {},
    danger: true,
    claudeArgs: ['--print', 'hi'],
  });
  assert.deepStrictEqual(spawnInput, {
    command: 'claude',
    args: ['--dangerously-skip-permissions', '--print', 'hi'],
    options: {
      stdio: 'inherit',
      env: { TEST: '1' },
    },
  });
  assert.equal(cleanupCalled, true);
});

test('run without a subcommand fails with usage', async () => {
  await assert.rejects(
    run([], {
      stdin: { isTTY: true, setRawMode() {} },
      stdout: { write() {} },
      stderr: { write() {} },
    }),
    /Usage: selo <claude\|codex>/,
  );
});
