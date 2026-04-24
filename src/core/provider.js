const ENV_RESET_KEYS = new Set([
  'API_TIMEOUT_MS',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
]);

function parseJson(text, errorMessage) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${errorMessage}: ${error.message}`);
  }
}

function parseProviderSettings(provider) {
  return parseJson(
    provider.settings_config,
    `Invalid settings_config for provider "${provider.name}"`
  );
}

function parseProviderMeta(provider) {
  if (!provider || typeof provider.meta !== 'string' || provider.meta.trim() === '') {
    return {};
  }

  return parseJson(provider.meta, `Invalid meta for provider "${provider.name}"`);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function mergeSettings(baseSettings = {}, overrideSettings = {}) {
  const merged = isPlainObject(baseSettings) ? cloneJson(baseSettings) : {};

  if (!isPlainObject(overrideSettings)) {
    return merged;
  }

  Object.entries(overrideSettings).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeSettings(merged[key], value);
      return;
    }

    merged[key] = cloneJson(value);
  });

  return merged;
}

function getPreferredModel(settings = {}) {
  const env = settings.env && typeof settings.env === 'object' ? settings.env : {};

  return env.ANTHROPIC_MODEL
    || env.ANTHROPIC_DEFAULT_OPUS_MODEL
    || env.ANTHROPIC_DEFAULT_SONNET_MODEL
    || env.ANTHROPIC_DEFAULT_HAIKU_MODEL
    || env.ANTHROPIC_REASONING_MODEL
    || settings.model
    || '';
}

function normalizeProviderSettings(settings = {}) {
  const normalized = JSON.parse(JSON.stringify(settings || {}));
  const env = normalized.env && typeof normalized.env === 'object' ? normalized.env : {};
  normalized.env = env;

  const preferredModel = getPreferredModel(normalized);
  if (preferredModel && !env.ANTHROPIC_MODEL) {
    env.ANTHROPIC_MODEL = preferredModel;
  }

  if (preferredModel && !env.ANTHROPIC_REASONING_MODEL) {
    env.ANTHROPIC_REASONING_MODEL = preferredModel;
  }

  if (preferredModel) {
    normalized.model = preferredModel;
  }

  return normalized;
}

function getBaseUrl(settingsConfig) {
  try {
    const cfg = JSON.parse(settingsConfig);
    return cfg.env && cfg.env.ANTHROPIC_BASE_URL ? cfg.env.ANTHROPIC_BASE_URL : '';
  } catch {
    return '';
  }
}

function getCodexSubText(row) {
  try {
    const cfg = JSON.parse(row.settings_config);
    const text = typeof cfg.config === 'string' ? cfg.config : '';
    const model = text.match(/^model\s*=\s*"([^"]+)"/m);
    const baseUrl = text.match(/^base_url\s*=\s*"([^"]+)"/m);
    return [model && model[1], baseUrl && baseUrl[1]].filter(Boolean).join('  ');
  } catch {
    return '';
  }
}

function getSubText(row) {
  if (row.notes && row.notes.trim()) {
    return row.notes;
  }

  return getBaseUrl(row.settings_config);
}

function resolveEffectiveSettings(provider, commonSettings = {}) {
  const providerSettings = parseProviderSettings(provider);
  const providerMeta = parseProviderMeta(provider);
  return normalizeProviderSettings(
    providerMeta.commonConfigEnabled
      ? mergeSettings(commonSettings, providerSettings)
      : providerSettings
  );
}

function buildChildEnv(settings) {
  const childEnv = { ...process.env };

  Object.keys(childEnv).forEach((key) => {
    if (key.startsWith('ANTHROPIC_') || ENV_RESET_KEYS.has(key)) {
      delete childEnv[key];
    }
  });

  if (settings.env && typeof settings.env === 'object') {
    Object.assign(childEnv, settings.env);
  }

  return childEnv;
}

function resolveDefaultProviderIdByKeys(
  rows,
  switchSettings = {},
  seloSettings = {},
  {
    currentProviderKey = 'currentProviderClaude',
    lastProviderKey = 'lastProviderClaude',
  } = {}
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  if (switchSettings[currentProviderKey]) {
    const currentRow = rows.find((row) => row.id === switchSettings[currentProviderKey]);
    if (currentRow) {
      return currentRow.id;
    }
  }

  const isCurrentRow = rows.find((row) => Number(row.is_current) === 1 || row.is_current === true);
  if (isCurrentRow) {
    return isCurrentRow.id;
  }

  if (seloSettings[lastProviderKey]) {
    const lastRow = rows.find((row) => row.id === seloSettings[lastProviderKey]);
    if (lastRow) {
      return lastRow.id;
    }
  }

  return rows[0].id;
}

function resolveDefaultProviderId(rows, switchSettings = {}, seloSettings = {}) {
  return resolveDefaultProviderIdByKeys(rows, switchSettings, seloSettings, {
    currentProviderKey: 'currentProviderClaude',
    lastProviderKey: 'lastProviderClaude',
  });
}

module.exports = {
  buildChildEnv,
  getBaseUrl,
  getCodexSubText,
  getPreferredModel,
  getSubText,
  mergeSettings,
  normalizeProviderSettings,
  parseJson,
  parseProviderMeta,
  parseProviderSettings,
  resolveDefaultProviderId,
  resolveDefaultProviderIdByKeys,
  resolveEffectiveSettings,
};
