const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { parseJson } = require('../core/provider.js');

function getConfigDir(platform = process.platform) {
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'selo');
  }

  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'selo');
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'selo');
}

function getSettingsPath(configDir = getConfigDir()) {
  return path.join(configDir, 'settings.json');
}

async function loadSeloSettings({ settingsPath = getSettingsPath(), readFileFn = fs.readFile } = {}) {
  try {
    const text = await readFileFn(settingsPath, 'utf8');
    return parseJson(text, `Invalid selo settings file at ${settingsPath}`);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function saveSeloSettings(
  settings,
  {
    settingsPath = getSettingsPath(),
    mkdirFn = fs.mkdir,
    writeFileFn = fs.writeFile,
  } = {}
) {
  await mkdirFn(path.dirname(settingsPath), { recursive: true });
  await writeFileFn(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

module.exports = {
  getConfigDir,
  getSettingsPath,
  loadSeloSettings,
  saveSeloSettings,
};
