const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  CODEX_PROFILE_PREFIX,
  cleanupStaleCodexProfiles,
  createCodexLaunchPlan,
  mergeCodexTomlConfig,
  supportsCodexProfile,
} = require('../src/core/codex-launch.js');

test('createCodexLaunchPlan writes a temporary profile in the native CODEX_HOME', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-home-test-'));
  const nativeConfig = 'model = "native-model"\n[mcp_servers.local]\ncommand = "node"\n';
  const nativeAuth = JSON.stringify({ tokens: { access_token: 'native-token' } });
  await fs.writeFile(path.join(codexHome, 'config.toml'), nativeConfig, 'utf8');
  await fs.writeFile(path.join(codexHome, 'auth.json'), nativeAuth, 'utf8');

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
    codexHome,
    profileName: `${CODEX_PROFILE_PREFIX}test`,
  });

  assert.equal(plan.command, 'codex');
  assert.deepStrictEqual(plan.args, [
    '--profile',
    `${CODEX_PROFILE_PREFIX}test`,
    '--search',
  ]);
  assert.equal(plan.env.CODEX_HOME, codexHome);
  assert.equal(plan.env.OPENAI_API_KEY, 'sk-test');
  assert.equal(plan.profilePath, path.join(
    codexHome,
    `${CODEX_PROFILE_PREFIX}test.config.toml`,
  ));

  const profileText = await fs.readFile(plan.profilePath, 'utf8');
  assert.match(profileText, /model_reasoning_effort = "xhigh"/);
  assert.match(profileText, /model_provider = "custom"/);
  assert.equal(await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8'), nativeConfig);
  assert.equal(await fs.readFile(path.join(codexHome, 'auth.json'), 'utf8'), nativeAuth);

  await plan.cleanup();
  await plan.cleanup();
  await assert.rejects(fs.stat(plan.profilePath), /ENOENT/);
  await fs.stat(codexHome);
  await fs.rm(codexHome, { recursive: true, force: true });
});

test('createCodexLaunchPlan passes unsupported management commands through without a profile', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-home-test-'));
  const plan = await createCodexLaunchPlan({
    provider: {
      name: 'Codex Provider',
      settings_config: JSON.stringify({
        auth: { OPENAI_API_KEY: 'sk-test' },
        config: 'model = "gpt-5.4"\n',
      }),
      meta: '{}',
    },
    codexArgs: ['doctor', '--json'],
    codexHome,
    profileName: `${CODEX_PROFILE_PREFIX}unused`,
  });

  assert.deepStrictEqual(plan.args, ['doctor', '--json']);
  assert.equal(plan.profilePath, '');
  assert.equal(plan.env.OPENAI_API_KEY, 'sk-test');
  await plan.cleanup();
  await fs.stat(codexHome);
  await fs.rm(codexHome, { recursive: true, force: true });
});

test('supportsCodexProfile distinguishes runtime and management commands', () => {
  assert.equal(supportsCodexProfile([]), true);
  assert.equal(supportsCodexProfile(['--search']), true);
  assert.equal(supportsCodexProfile(['exec', '--ephemeral', 'hello']), true);
  assert.equal(supportsCodexProfile(['resume', '--last']), true);
  assert.equal(supportsCodexProfile(['mcp', 'list']), true);
  assert.equal(supportsCodexProfile(['debug', 'prompt-input']), true);
  assert.equal(supportsCodexProfile(['doctor', '--json']), false);
  assert.equal(supportsCodexProfile(['plugin', 'list']), false);
  assert.equal(supportsCodexProfile(['features', 'list']), false);
  assert.equal(supportsCodexProfile(['debug', 'models']), false);
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

test('cleanupStaleCodexProfiles removes old selo profiles only', async () => {
  const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-codex-clean-test-'));
  const oldProfile = path.join(codexHome, `${CODEX_PROFILE_PREFIX}old.config.toml`);
  const freshProfile = path.join(codexHome, `${CODEX_PROFILE_PREFIX}fresh.config.toml`);
  const otherFile = path.join(codexHome, 'config.toml');
  const matchingDir = path.join(codexHome, `${CODEX_PROFILE_PREFIX}directory.config.toml`);
  await fs.writeFile(oldProfile, 'model = "old"\n', 'utf8');
  await fs.writeFile(freshProfile, 'model = "fresh"\n', 'utf8');
  await fs.writeFile(otherFile, 'model = "native"\n', 'utf8');
  await fs.mkdir(matchingDir);

  const now = Date.now();
  const oldDate = new Date(now - 25 * 60 * 60 * 1000);
  await fs.utimes(oldProfile, oldDate, oldDate);
  await fs.utimes(matchingDir, oldDate, oldDate);

  await cleanupStaleCodexProfiles({ codexHome, now });

  await assert.rejects(fs.stat(oldProfile), /ENOENT/);
  await fs.stat(freshProfile);
  await fs.stat(otherFile);
  await fs.stat(matchingDir);
  await fs.rm(codexHome, { recursive: true, force: true });
});
