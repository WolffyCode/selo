const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  parseProviderMeta,
  parseProviderSettings,
} = require('./provider.js');

const CODEX_TEMP_PREFIX = 'selo-codex-';
const STALE_CODEX_HOME_AGE_MS = 24 * 60 * 60 * 1000;

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

function hasAuthConfig(auth) {
  return Boolean(auth) && typeof auth === 'object' && !Array.isArray(auth)
    && Object.keys(auth).length > 0;
}

async function cleanupStaleCodexHomes({
  tempRoot = os.tmpdir(),
  now = Date.now(),
  maxAgeMs = STALE_CODEX_HOME_AGE_MS,
  readdirFn = fs.readdir,
  statFn = fs.stat,
  rmFn = fs.rm,
} = {}) {
  let entries;
  try {
    entries = await readdirFn(tempRoot, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  await Promise.all(entries.map(async (entry) => {
    if (!entry.name.startsWith(CODEX_TEMP_PREFIX)) {
      return;
    }

    if (typeof entry.isDirectory === 'function' && !entry.isDirectory()) {
      return;
    }

    const fullPath = path.join(tempRoot, entry.name);
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

    await rmFn(fullPath, { recursive: true, force: true });
  }));
}

async function createCodexLaunchPlan({
  provider,
  commonConfig = '',
  codexArgs,
  tempRoot = os.tmpdir(),
  mkdtempFn = fs.mkdtemp,
  writeFileFn = fs.writeFile,
  rmFn = fs.rm,
  cleanupStaleCodexHomesFn = cleanupStaleCodexHomes,
} = {}) {
  await cleanupStaleCodexHomesFn({ tempRoot });

  const providerSettings = parseProviderSettings(provider);
  const providerMeta = parseProviderMeta(provider);
  const providerConfig = typeof providerSettings.config === 'string'
    ? providerSettings.config
    : '';
  const configText = providerMeta.commonConfigEnabled
    ? mergeCodexTomlConfig(commonConfig, providerConfig)
    : mergeCodexTomlConfig('', providerConfig);
  const codexHome = await mkdtempFn(path.join(tempRoot, CODEX_TEMP_PREFIX));
  const configPath = path.join(codexHome, 'config.toml');
  const authPath = path.join(codexHome, 'auth.json');
  const nativeCodexHome = path.join(os.homedir(), '.codex');

  await writeFileFn(configPath, configText, 'utf8');

  if (hasAuthConfig(providerSettings.auth)) {
    await writeFileFn(authPath, JSON.stringify(providerSettings.auth, null, 2), 'utf8');
  }

  await Promise.all(['sessions', 'archived_sessions'].map(async (name) => {
    const sourcePath = path.join(nativeCodexHome, name);
    const targetPath = path.join(codexHome, name);

    try {
      await fs.symlink(sourcePath, targetPath, 'dir');
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        return;
      }

      throw error;
    }
  }));

  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) {
      return;
    }

    cleaned = true;
    await rmFn(codexHome, { recursive: true, force: true });
  };

  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  env.CODEX_HOME = codexHome;

  if (
    providerSettings.auth
    && typeof providerSettings.auth.OPENAI_API_KEY === 'string'
    && providerSettings.auth.OPENAI_API_KEY
  ) {
    env.OPENAI_API_KEY = providerSettings.auth.OPENAI_API_KEY;
  }

  return {
    command: 'codex',
    args: Array.isArray(codexArgs) ? [...codexArgs] : [],
    env,
    codexHome,
    configPath,
    authPath: hasAuthConfig(providerSettings.auth) ? authPath : '',
    cleanup,
  };
}

module.exports = {
  CODEX_TEMP_PREFIX,
  STALE_CODEX_HOME_AGE_MS,
  cleanupStaleCodexHomes,
  createCodexLaunchPlan,
  mergeCodexTomlConfig,
};
