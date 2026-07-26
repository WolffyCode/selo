const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const {
  parseProviderMeta,
  parseProviderSettings,
} = require('./provider.js');

const CODEX_PROFILE_PREFIX = 'selo-provider-';
const STALE_CODEX_PROFILE_AGE_MS = 24 * 60 * 60 * 1000;
const CODEX_COMMANDS = new Set([
  'app',
  'app-server',
  'apply',
  'archive',
  'cloud',
  'completion',
  'debug',
  'delete',
  'doctor',
  'exec',
  'exec-server',
  'features',
  'fork',
  'help',
  'login',
  'logout',
  'mcp',
  'mcp-server',
  'plugin',
  'remote-control',
  'resume',
  'review',
  'sandbox',
  'unarchive',
  'update',
]);
const PROFILE_COMMANDS = new Set([
  'archive',
  'delete',
  'exec',
  'fork',
  'mcp',
  'resume',
  'review',
  'sandbox',
  'unarchive',
]);

function parseTomlSections(text = '') {
  const sections = new Map();
  const order = [''];
  let current = '';

  sections.set('', { header: '', entries: [] });

  String(text).split(/\r?\n/).forEach((line) => {
    const sectionMatch = line.match(/^\s*(\[\[?.+\]\]?)\s*$/);
    if (sectionMatch) {
      current = sectionMatch[1];
      if (!sections.has(current)) {
        sections.set(current, { header: current, entries: [] });
        order.push(current);
      }
      return;
    }

    const keyMatch = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
    sections.get(current).entries.push({
      kind: keyMatch ? 'key' : 'line',
      key: keyMatch ? keyMatch[1] : '',
      line,
    });
  });

  return { order, sections };
}

function mergeParsedToml(target, sourceText, replaceKeys) {
  const source = parseTomlSections(sourceText);

  source.order.forEach((sectionName) => {
    if (!target.sections.has(sectionName)) {
      target.sections.set(sectionName, {
        header: sectionName,
        entries: [],
      });
      target.order.push(sectionName);
    }

    const targetSection = target.sections.get(sectionName);
    source.sections.get(sectionName).entries.forEach((entry) => {
      if (replaceKeys && entry.kind === 'key') {
        const existingIndex = targetSection.entries.findIndex(
          (candidate) => candidate.kind === 'key' && candidate.key === entry.key
        );
        if (existingIndex !== -1) {
          targetSection.entries[existingIndex] = entry;
          return;
        }
      }

      targetSection.entries.push(entry);
    });
  });
}

function stringifyParsedToml(parsed) {
  const lines = [];

  parsed.order.forEach((sectionName) => {
    const section = parsed.sections.get(sectionName);
    const entries = section.entries.filter((entry, index, all) => {
      if (entry.line !== '') {
        return true;
      }

      return index > 0 && all[index - 1].line !== '';
    });

    if (sectionName) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(section.header);
    }

    entries.forEach((entry) => {
      lines.push(entry.line);
    });
  });

  return lines.join('\n').trimEnd() + '\n';
}

function mergeCodexTomlConfig(commonConfig = '', providerConfig = '') {
  const parsed = parseTomlSections('');
  mergeParsedToml(parsed, commonConfig, false);
  mergeParsedToml(parsed, providerConfig, true);
  return stringifyParsedToml(parsed);
}

function resolveCodexHome(env = process.env, homeDir = os.homedir()) {
  return env.CODEX_HOME || path.join(homeDir, '.codex');
}

function supportsCodexProfile(codexArgs = []) {
  const args = Array.isArray(codexArgs) ? codexArgs : [];
  const commandIndex = args.findIndex((arg) => CODEX_COMMANDS.has(arg));

  if (commandIndex === -1) {
    return true;
  }

  const command = args[commandIndex];
  if (command === 'debug') {
    return args[commandIndex + 1] === 'prompt-input';
  }

  return PROFILE_COMMANDS.has(command);
}

async function cleanupStaleCodexProfiles({
  codexHome = resolveCodexHome(),
  now = Date.now(),
  maxAgeMs = STALE_CODEX_PROFILE_AGE_MS,
  readdirFn = fs.readdir,
  statFn = fs.stat,
  unlinkFn = fs.unlink,
} = {}) {
  let entries;
  try {
    entries = await readdirFn(codexHome, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    if (
      !entry.name.startsWith(CODEX_PROFILE_PREFIX)
      || !entry.name.endsWith('.config.toml')
    ) {
      return;
    }

    if (typeof entry.isFile === 'function' && !entry.isFile()) {
      return;
    }

    const fullPath = path.join(codexHome, entry.name);
    let stats;
    try {
      stats = await statFn(fullPath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    if (now - Number(stats.mtimeMs || 0) <= maxAgeMs) {
      return;
    }

    try {
      await unlinkFn(fullPath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }));
}

async function createCodexLaunchPlan({
  provider,
  commonConfig = '',
  codexArgs,
  codexHome = resolveCodexHome(),
  profileName,
  mkdirFn = fs.mkdir,
  writeFileFn = fs.writeFile,
  unlinkFn = fs.unlink,
  cleanupStaleCodexProfilesFn = cleanupStaleCodexProfiles,
} = {}) {
  await cleanupStaleCodexProfilesFn({ codexHome });

  const providerSettings = parseProviderSettings(provider);
  const providerMeta = parseProviderMeta(provider);
  const providerConfig = typeof providerSettings.config === 'string'
    ? providerSettings.config
    : '';
  const configText = providerMeta.commonConfigEnabled
    ? mergeCodexTomlConfig(commonConfig, providerConfig)
    : mergeCodexTomlConfig('', providerConfig);
  const launchArgs = Array.isArray(codexArgs) ? [...codexArgs] : [];
  const useProfile = supportsCodexProfile(launchArgs);
  const selectedProfileName = useProfile
    ? profileName || `${CODEX_PROFILE_PREFIX}${process.pid}-${Date.now()}-${randomUUID()}`
    : '';
  const profilePath = selectedProfileName
    ? path.join(codexHome, `${selectedProfileName}.config.toml`)
    : '';

  if (profilePath) {
    await mkdirFn(codexHome, { recursive: true });
    await writeFileFn(profilePath, configText, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    if (!profilePath) {
      return;
    }

    try {
      await unlinkFn(profilePath);
    } catch (error) {
      if (!error || error.code !== 'ENOENT') {
        throw error;
      }
    }
  };

  const env = { ...process.env, CODEX_HOME: codexHome };
  delete env.OPENAI_API_KEY;

  if (
    providerSettings.auth
    && typeof providerSettings.auth.OPENAI_API_KEY === 'string'
    && providerSettings.auth.OPENAI_API_KEY
  ) {
    env.OPENAI_API_KEY = providerSettings.auth.OPENAI_API_KEY;
  }

  return {
    command: 'codex',
    args: profilePath
      ? ['--profile', selectedProfileName, ...launchArgs]
      : launchArgs,
    env,
    codexHome,
    configPath: profilePath,
    profileName: selectedProfileName,
    profilePath,
    authPath: '',
    cleanup,
  };
}

module.exports = {
  CODEX_PROFILE_PREFIX,
  STALE_CODEX_PROFILE_AGE_MS,
  cleanupStaleCodexProfiles,
  createCodexLaunchPlan,
  mergeCodexTomlConfig,
  resolveCodexHome,
  supportsCodexProfile,
};
