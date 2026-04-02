const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createLaunchPlan } = require('../src/core/launch.js');

test('createLaunchPlan writes a temp settings file and injects --settings', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-test-'));
  const plan = await createLaunchPlan({
    provider: {
      name: 'MiniMax',
      settings_config: JSON.stringify({
        env: {
          ANTHROPIC_MODEL: 'MiniMax-M2.7-highspeed',
        },
        alwaysThinkingEnabled: true,
      }),
      meta: JSON.stringify({ commonConfigEnabled: false }),
    },
    commonSettings: {},
    danger: true,
    claudeArgs: ['--print', 'hi'],
    tempDir,
  });

  assert.equal(plan.command, 'claude');
  assert.deepStrictEqual(plan.args.slice(0, 8), [
    '--setting-sources',
    'project,local',
    '--settings',
    plan.settingsPath,
    '--model',
    'MiniMax-M2.7-highspeed',
    '--dangerously-skip-permissions',
    '--print',
  ]);

  const settingsText = await fs.readFile(plan.settingsPath, 'utf8');
  assert.deepStrictEqual(JSON.parse(settingsText), {
    env: {
      ANTHROPIC_MODEL: 'MiniMax-M2.7-highspeed',
      ANTHROPIC_REASONING_MODEL: 'MiniMax-M2.7-highspeed',
    },
    alwaysThinkingEnabled: true,
    model: 'MiniMax-M2.7-highspeed',
  });

  await plan.cleanup();
  await plan.cleanup();
  await assert.rejects(fs.readFile(plan.settingsPath, 'utf8'));
  await fs.rmdir(tempDir);
});

test('createLaunchPlan respects explicit --model overrides', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'selo-test-'));
  const plan = await createLaunchPlan({
    provider: {
      name: 'glm',
      settings_config: JSON.stringify({
        env: {
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.1',
        },
      }),
      meta: JSON.stringify({ commonConfigEnabled: false }),
    },
    commonSettings: {},
    danger: false,
    claudeArgs: ['--model', 'custom-model', '--print', 'hi'],
    tempDir,
  });

  assert.deepStrictEqual(plan.args, [
    '--setting-sources',
    'project,local',
    '--settings',
    plan.settingsPath,
    '--model',
    'custom-model',
    '--print',
    'hi',
  ]);

  await plan.cleanup();
  await fs.rmdir(tempDir);
});

test('createLaunchPlan throws on malformed provider settings', async () => {
  await assert.rejects(
    createLaunchPlan({
      provider: {
        name: 'broken',
        settings_config: '{bad json',
      },
      commonSettings: {},
      danger: false,
      claudeArgs: [],
    }),
    /Invalid settings_config/,
  );
});
