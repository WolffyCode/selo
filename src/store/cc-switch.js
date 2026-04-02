const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { parseJson } = require('../core/provider.js');

const SWITCH_DIR = path.join(os.homedir(), '.cc-switch');
const DB_PATH = path.join(SWITCH_DIR, 'cc-switch.db');
const SETTINGS_PATH = path.join(SWITCH_DIR, 'settings.json');
const PROVIDERS_SQL = [
  'SELECT',
  'id,',
  'name,',
  'notes,',
  'settings_config,',
  'meta,',
  'is_current',
  'FROM providers',
  "WHERE app_type='claude'",
  'ORDER BY created_at;',
].join(' ');
const COMMON_CLAUDE_CONFIG_SQL = [
  'SELECT value',
  'FROM settings',
  "WHERE key='common_config_claude'",
  'LIMIT 1;',
].join(' ');

function normalizeSqliteError(error, dbPath) {
  if (error && error.code === 'ENOENT') {
    return new Error('sqlite3 is required. Please install sqlite3 to let selo read CC Switch data.');
  }

  const message = [
    error && error.message,
    error && error.stderr && String(error.stderr),
  ].filter(Boolean).join('\n');

  if (
    message.includes('unable to open database file')
    || message.includes('no such table')
    || message.includes('no such file')
  ) {
    return new Error(`CC Switch DB not found at ${dbPath}. Please install CC Switch first.`);
  }

  return error;
}

function queryJson(sql, { dbPath = DB_PATH, execFileSyncFn = execFileSync } = {}) {
  let output;

  try {
    output = execFileSyncFn('sqlite3', ['-json', dbPath, sql], {
      encoding: 'utf8',
    });
  } catch (error) {
    throw normalizeSqliteError(error, dbPath);
  }

  return parseJson(output || '[]', `Invalid JSON returned from ${dbPath}`);
}

function loadProviders({ dbPath = DB_PATH, queryJsonFn = queryJson } = {}) {
  const rows = queryJsonFn(PROVIDERS_SQL, { dbPath });

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('No Claude providers found in CC Switch.\nPlease configure providers in CC Switch first.');
  }

  return rows;
}

function loadProviderById(providerId, { dbPath = DB_PATH, queryJsonFn = queryJson } = {}) {
  const safeId = String(providerId).replace(/'/g, "''");
  const rows = queryJsonFn([
    'SELECT',
    'id,',
    'name,',
    'notes,',
    'settings_config,',
    'meta,',
    'is_current',
    'FROM providers',
    "WHERE app_type='claude'",
    `AND id='${safeId}'`,
    'LIMIT 1;',
  ].join(' '), { dbPath });

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`Selected provider "${providerId}" was removed from CC Switch. Please reopen selo and try again.`);
  }

  return rows[0];
}

function loadCommonClaudeSettings({ dbPath = DB_PATH, queryJsonFn = queryJson } = {}) {
  const rows = queryJsonFn(COMMON_CLAUDE_CONFIG_SQL, { dbPath });
  if (!Array.isArray(rows) || rows.length === 0) {
    return {};
  }

  const [row] = rows;
  if (!row || typeof row.value !== 'string' || row.value.trim() === '') {
    return {};
  }

  return parseJson(row.value, `Invalid common Claude config in ${dbPath}`);
}

async function loadSwitchSettings({ settingsPath = SETTINGS_PATH, readFileFn = fs.readFile } = {}) {
  try {
    const text = await readFileFn(settingsPath, 'utf8');
    return parseJson(text, `Invalid CC Switch settings file at ${settingsPath}`);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function getFingerprint({
  dbPath = DB_PATH,
  settingsPath = SETTINGS_PATH,
  statFn = fs.stat,
} = {}) {
  const [dbStats, settingsStats] = await Promise.all([
    statFn(dbPath),
    statFn(settingsPath).catch((error) => {
      if (error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }),
  ]);

  return {
    dbMtimeMs: Number(dbStats.mtimeMs || 0),
    dbSize: Number(dbStats.size || 0),
    settingsMtimeMs: Number(settingsStats && settingsStats.mtimeMs || 0),
    settingsSize: Number(settingsStats && settingsStats.size || 0),
  };
}

async function loadSnapshot({
  loadProvidersFn = loadProviders,
  loadCommonClaudeSettingsFn = loadCommonClaudeSettings,
  loadSwitchSettingsFn = loadSwitchSettings,
  getFingerprintFn = getFingerprint,
} = {}) {
  const [providers, commonSettings, switchSettings, fingerprint] = await Promise.all([
    Promise.resolve(loadProvidersFn()),
    Promise.resolve(loadCommonClaudeSettingsFn()),
    Promise.resolve(loadSwitchSettingsFn()),
    Promise.resolve(getFingerprintFn()),
  ]);

  return {
    providers,
    commonSettings,
    switchSettings,
    fingerprint,
  };
}

module.exports = {
  DB_PATH,
  SETTINGS_PATH,
  getFingerprint,
  loadCommonClaudeSettings,
  loadProviderById,
  loadProviders,
  loadSnapshot,
  loadSwitchSettings,
  normalizeSqliteError,
  queryJson,
};
