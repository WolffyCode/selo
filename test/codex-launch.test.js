const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  cleanupStaleCodexHomes,
  createCodexLaunchPlan,
  mergeCodexTomlConfig,
} = require('../src/core/codex-launch.js');

test('createCodexLaunchPlan writes an isolated CODEX_HOME', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-test-'));
  const plan = await createCodexLaunchPlan({
    provider: {
      name: 'Cubence Codex',
      settings_config: JSON.stringify({
        auth: {
          OPENAI_API_KEY: 'sk-test',
        },
        config: 'model_provider = "custom"\nmodel = "gpt-5.4"\n',
      }),
      meta: JSON.stringify({ commonConfigEnabled: true }),
    },
    commonConfig: 'model_reasoning_effort = "xhigh"\n',
    codexArgs: ['--search'],
    tempRoot,
  });

  assert.equal(plan.command, 'codex');
  assert.deepStrictEqual(plan.args, ['--search']);
  assert.equal(plan.env.CODEX_HOME, plan.codexHome);
  assert.equal(plan.env.OPENAI_API_KEY, 'sk-test');
  assert.match(plan.codexHome, new RegExp(`${path.basename(tempRoot)}/selo-codex-`));

  const configText = await fs.readFile(path.join(plan.codexHome, 'config.toml'), 'utf8');
  assert.match(configText, /model_reasoning_effort = "xhigh"/);
  assert.match(configText, /model_provider = "custom"/);

  const authText = await fs.readFile(path.join(plan.codexHome, 'auth.json'), 'utf8');
  assert.deepStrictEqual(JSON.parse(authText), {
    OPENAI_API_KEY: 'sk-test',
  });

  await plan.cleanup();
  await assert.rejects(fs.stat(plan.codexHome), /ENOENT/);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('createCodexLaunchPlan links native Codex session state for resume', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-test-'));
  const sourceHome = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-source-'));
  await fs.mkdir(path.join(sourceHome, 'sessions'));
  await fs.mkdir(path.join(sourceHome, 'archived_sessions'));

  const originalHome = process.env.HOME;
  process.env.HOME = path.dirname(sourceHome);
  const nativeCodexHome = path.join(process.env.HOME, '.codex');
  await fs.rename(sourceHome, nativeCodexHome);

  try {
    const plan = await createCodexLaunchPlan({
      provider: {
        name: 'Codex Provider',
        settings_config: JSON.stringify({ config: 'model = "gpt-5.4"\n' }),
        meta: '{}',
      },
      codexArgs: ['resume', '019dbd7e-fc5b-7b71-b8ea-f48ad567985f'],
      tempRoot,
    });

    const sessionsStats = await fs.lstat(path.join(plan.codexHome, 'sessions'));
    const archivedSessionsStats = await fs.lstat(path.join(plan.codexHome, 'archived_sessions'));
    assert.equal(sessionsStats.isSymbolicLink(), true);
    assert.equal(archivedSessionsStats.isSymbolicLink(), true);

    await plan.cleanup();
  } finally {
    process.env.HOME = originalHome;
    await fs.rm(tempRoot, { recursive: true, force: true });
    await fs.rm(nativeCodexHome, { recursive: true, force: true });
  }
});

test('mergeCodexTomlConfig lets provider keys override common keys', () => {
  const text = mergeCodexTomlConfig(
    'model = "gpt-5.4"\n[projects."/tmp/a"]\ntrust_level = "trusted"\n',
    'model = "gpt-5.5"\n[projects."/tmp/b"]\ntrust_level = "trusted"\n',
  );

  assert.match(text, /model = "gpt-5.5"/);
  assert.doesNotMatch(text, /model = "gpt-5.4"/);
  assert.match(text, /\[projects."\/tmp\/a"\]/);
  assert.match(text, /\[projects."\/tmp\/b"\]/);
});

test('cleanupStaleCodexHomes removes old selo-codex temp dirs only', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-clean-test-'));
  const oldDir = path.join(tempRoot, 'selo-codex-old');
  const freshDir = path.join(tempRoot, 'selo-codex-fresh');
  const otherDir = path.join(tempRoot, 'other');
  await fs.mkdir(oldDir);
  await fs.mkdir(freshDir);
  await fs.mkdir(otherDir);

  const now = Date.now();
  const oldDate = new Date(now - 25 * 60 * 60 * 1000);
  await fs.utimes(oldDir, oldDate, oldDate);

  await cleanupStaleCodexHomes({ tempRoot, now });

  await assert.rejects(fs.stat(oldDir), /ENOENT/);
  await fs.stat(freshDir);
  await fs.stat(otherDir);
  await fs.rm(tempRoot, { recursive: true, force: true });
});
