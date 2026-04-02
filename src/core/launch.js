const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildChildEnv,
  getPreferredModel,
  resolveEffectiveSettings,
} = require('./provider.js');

async function createLaunchPlan({
  provider,
  commonSettings,
  danger,
  claudeArgs,
  tempDir,
  mkdtempFn = fs.mkdtemp,
  writeFileFn = fs.writeFile,
  unlinkFn = fs.unlink,
  rmFn = fs.rm,
} = {}) {
  const settings = resolveEffectiveSettings(provider, commonSettings);
  const ownedTempDir = tempDir || await mkdtempFn(path.join(os.tmpdir(), 'selo-settings-'));
  const settingsPath = path.join(
    ownedTempDir,
    `claude-settings-${process.pid}-${Date.now()}.json`
  );

  await writeFileFn(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;

    try {
      await unlinkFn(settingsPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (!tempDir) {
      try {
        await rmFn(ownedTempDir, { recursive: true, force: true });
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  };

  const launchArgs = Array.isArray(claudeArgs) ? [...claudeArgs] : [];
  const args = ['--setting-sources', 'project,local', '--settings', settingsPath];
  const hasExplicitModelArg = launchArgs.some(
    (arg, index) => arg === '--model' && index < launchArgs.length - 1
  );
  const preferredModel = getPreferredModel(settings);

  if (preferredModel && !hasExplicitModelArg) {
    args.push('--model', preferredModel);
  }

  if (danger) {
    args.push('--dangerously-skip-permissions');
  }

  args.push(...launchArgs);

  return {
    command: 'claude',
    args,
    env: buildChildEnv(settings),
    settings,
    settingsPath,
    cleanup,
  };
}

module.exports = {
  createLaunchPlan,
};
