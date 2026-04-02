const fs = require('node:fs');
const readline = require('node:readline');
const { execFileSync, spawn } = require('node:child_process');

const { version: VERSION } = require('../package.json');
const { createLaunchPlan } = require('./core/launch.js');
const { getSubText, resolveDefaultProviderId } = require('./core/provider.js');
const {
  DB_PATH,
  SETTINGS_PATH,
  getFingerprint,
  loadCommonClaudeSettings,
  loadProviderById,
  loadSnapshot,
} = require('./store/cc-switch.js');
const { loadSeloSettings, saveSeloSettings } = require('./store/selo-config.js');

function buildVersionString(version = VERSION) {
  return `selo v${version}`;
}

function parseCliArgs(argv) {
  const args = [...argv];

  if (args[0] === '-v' || args[0] === '--version') {
    return {
      showVersion: true,
      danger: false,
      claudeArgs: [],
    };
  }

  let danger = false;
  if (args[0] === '-d') {
    danger = true;
    args.shift();
  }

  return {
    showVersion: false,
    danger,
    claudeArgs: args,
  };
}

function reconcileSelection(
  selectedId,
  previousRows,
  nextRows,
  switchSettings = {},
  seloSettings = {}
) {
  if (!Array.isArray(nextRows) || nextRows.length === 0) {
    return null;
  }

  if (selectedId && nextRows.some((row) => row.id === selectedId)) {
    return selectedId;
  }

  return resolveDefaultProviderId(nextRows, switchSettings, seloSettings);
}

function assertClaudeAvailable({ execFileSyncFn = execFileSync } = {}) {
  try {
    execFileSyncFn('claude', ['--version'], { stdio: 'ignore' });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('claude CLI is required. Please install Claude Code first.');
    }

    throw error;
  }
}

function createSnapshotWatcher({
  switchDir = require('node:path').dirname(DB_PATH),
  pollIntervalMs = 750,
  watchFn = fs.watch,
  getFingerprintFn = getFingerprint,
  onChange,
  onError,
  initialFingerprint,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  let closed = false;
  let currentFingerprint = initialFingerprint;
  let checking = false;
  let queued = false;
  let watcher = null;

  const fingerprintsEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  const check = async () => {
    if (closed || checking) {
      queued = true;
      return;
    }

    checking = true;
    try {
      const nextFingerprint = await getFingerprintFn();
      if (!fingerprintsEqual(nextFingerprint, currentFingerprint)) {
        currentFingerprint = nextFingerprint;
        await onChange(nextFingerprint);
      }
    } catch (error) {
      if (onError) {
        onError(error);
      }
    } finally {
      checking = false;
      if (queued && !closed) {
        queued = false;
        void check();
      }
    }
  };

  try {
    watcher = watchFn(switchDir, () => {
      void check();
    });
  } catch (error) {
    if (onError) {
      onError(error);
    }
  }

  const interval = setIntervalFn(() => {
    void check();
  }, pollIntervalMs);

  if (typeof interval.unref === 'function') {
    interval.unref();
  }

  return {
    close() {
      closed = true;
      if (watcher) {
        watcher.close();
      }
      clearIntervalFn(interval);
    },
  };
}

function clearScreen(stream) {
  stream.write('\x1b[2J\x1b[H');
}

function restoreTerminal(input) {
  if (input.isTTY && typeof input.setRawMode === 'function') {
    input.setRawMode(false);
  }
  input.pause();
}

function drawPicker(stream, rows, selectedId, footerMessage = '') {
  const B = '\x1b[1m';
  const CY = '\x1b[36m';
  const D = '\x1b[2m';
  const R = '\x1b[0m';

  clearScreen(stream);
  stream.write('\n  ' + CY + B + 'SELO - Select Provider' + R + '\n\n');
  rows.forEach((row) => {
    const active = row.id === selectedId;
    const prefix = active ? '  ' + CY + B + '\u276f ' + R : '    ';
    const name = active ? B + row.name + R : row.name;
    const sub = D + getSubText(row) + R;
    stream.write(prefix + name + '\n');
    stream.write('    ' + sub + '\n');
  });

  stream.write('\n  ' + D + '\u2191\u2193 navigate  Enter select  Esc cancel' + R + '\n');
  if (footerMessage) {
    stream.write('\n  ' + footerMessage + '\n');
  }
}

async function run(argv = [], deps = {}) {
  const {
    stdin = process.stdin,
    stdout = process.stdout,
    stderr = process.stderr,
    spawnFn = spawn,
    loadSnapshotFn = loadSnapshot,
    loadProviderByIdFn = loadProviderById,
    loadCommonClaudeSettingsFn = loadCommonClaudeSettings,
    loadSeloSettingsFn = loadSeloSettings,
    saveSeloSettingsFn = saveSeloSettings,
    createLaunchPlanFn = createLaunchPlan,
    createSnapshotWatcherFn = createSnapshotWatcher,
    assertClaudeAvailableFn = assertClaudeAvailable,
  } = deps;
  const parsedArgs = parseCliArgs(argv);

  if (parsedArgs.showVersion) {
    stdout.write(buildVersionString(VERSION) + '\n');
    return 0;
  }

  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('selo requires an interactive terminal.');
  }

  let snapshot = await loadSnapshotFn();
  let seloSettings = await loadSeloSettingsFn();
  let selectedId = resolveDefaultProviderId(
    snapshot.providers,
    snapshot.switchSettings,
    seloSettings
  );
  let footerMessage = '';
  let reloading = false;
  let queuedReload = false;

  const reloadSnapshot = async () => {
    if (reloading) {
      queuedReload = true;
      return;
    }

    reloading = true;
    try {
      do {
        queuedReload = false;
        const nextSnapshot = await loadSnapshotFn();
        selectedId = reconcileSelection(
          selectedId,
          snapshot.providers,
          nextSnapshot.providers,
          nextSnapshot.switchSettings,
          seloSettings
        );
        snapshot = nextSnapshot;
        footerMessage = 'CC Switch updated. Picker reloaded.';
        drawPicker(stderr, snapshot.providers, selectedId, footerMessage);
      } while (queuedReload);
    } catch (error) {
      footerMessage = `Reload failed: ${error.message}`;
      drawPicker(stderr, snapshot.providers, selectedId, footerMessage);
    } finally {
      reloading = false;
    }
  };

  const watcher = createSnapshotWatcherFn({
    initialFingerprint: snapshot.fingerprint,
    onChange: reloadSnapshot,
    onError: (error) => {
      footerMessage = `Watch failed: ${error.message}`;
      drawPicker(stderr, snapshot.providers, selectedId, footerMessage);
    },
  });

  readline.emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  drawPicker(stderr, snapshot.providers, selectedId, footerMessage);

  return new Promise((resolve, reject) => {
    const finish = (error, exitCode = 0) => {
      watcher.close();
      stdin.removeListener('keypress', onKeypress);
      restoreTerminal(stdin);
      if (error) {
        reject(error);
        return;
      }
      resolve(exitCode);
    };

    const onKeypress = async (_, key) => {
      if (key.name === 'up' || key.name === 'down') {
        const rows = snapshot.providers;
        const currentIndex = Math.max(0, rows.findIndex((row) => row.id === selectedId));
        const delta = key.name === 'up' ? -1 : 1;
        const nextIndex = (currentIndex + delta + rows.length) % rows.length;
        selectedId = rows[nextIndex].id;
        footerMessage = '';
        drawPicker(stderr, rows, selectedId, footerMessage);
        return;
      }

      if (key.name === 'return') {
        watcher.close();
        stdin.removeListener('keypress', onKeypress);
        restoreTerminal(stdin);
        clearScreen(stderr);

        try {
          const latestProvider = loadProviderByIdFn(selectedId);
          const commonSettings = loadCommonClaudeSettingsFn();
          seloSettings = await loadSeloSettingsFn();
          await saveSeloSettingsFn({
            ...seloSettings,
            lastProviderClaude: latestProvider.id,
          });
          assertClaudeAvailableFn();

          const launchPlan = await createLaunchPlanFn({
            provider: latestProvider,
            commonSettings,
            danger: parsedArgs.danger,
            claudeArgs: parsedArgs.claudeArgs,
          });

          const child = spawnFn(launchPlan.command, launchPlan.args, {
            stdio: 'inherit',
            env: launchPlan.env,
          });

          child.on('error', async (error) => {
            await launchPlan.cleanup();
            reject(error.code === 'ENOENT'
              ? new Error('claude CLI is required. Please install Claude Code first.')
              : error);
          });
          child.on('exit', async (code, signal) => {
            await launchPlan.cleanup();
            if (signal) {
              reject({ signal });
              return;
            }
            resolve(code ?? 0);
          });
        } catch (error) {
          reject(error);
        }
        return;
      }

      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        finish(null, 1);
      }
    };

    stdin.on('keypress', onKeypress);
  });
}

module.exports = {
  buildVersionString,
  createSnapshotWatcher,
  parseCliArgs,
  reconcileSelection,
  run,
};
