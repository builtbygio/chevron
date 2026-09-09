'use strict';

/**
 * How this build updates itself.
 *
 * Packaging writes `app-update.yml` next to the app (Contents/Resources on
 * macOS, resources/ elsewhere). electron-updater reads it for the GitHub
 * Releases provider; Chevron reads it too, for the one fact electron-updater
 * does not know: whether the build is code-signed. Squirrel.Mac refuses to
 * install an unsigned update, so an unsigned macOS preview keeps pointing at
 * the download page instead of failing every four hours.
 *
 * The file is flat `key: value` pairs, written by script/lib/update-config-file.js,
 * so it is parsed here without a YAML dependency in the main process.
 *
 * docs/reference/auto-update.md
 */

const fs = require('fs');
const path = require('path');

const IN_APP = 'in-app';
const DOWNLOAD_PAGE = 'download-page';
const UNSUPPORTED = 'unsupported';

function parseFlatYaml(text) {
  const result = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    } else if (value === 'true' || value === 'false') {
      value = value === 'true';
    } else if (value === '') {
      value = null;
    }
    result[match[1]] = value;
  }
  return result;
}

function updateConfigPath(resourcesPath) {
  return path.join(resourcesPath, 'app-update.yml');
}

function readUpdateConfig(resourcesPath) {
  try {
    return parseFlatYaml(
      fs.readFileSync(updateConfigPath(resourcesPath), 'utf8')
    );
  } catch (error) {
    return null;
  }
}

/**
 * Which update path a build takes.
 *
 *  - `in-app`: electron-updater downloads and installs (NSIS on Windows,
 *    Squirrel.Mac on a signed macOS build).
 *  - `download-page`: check GitHub Releases and open the page. Linux
 *    (package managers own the install), an unsigned macOS build, or a
 *    packaged build without app-update.yml.
 *  - `unsupported`: not a packaged build.
 */
function chooseUpdateMode({ platform, isPackaged, updateConfig, env = {} }) {
  if (env.CHEVRON_UPDATE_FEED_URL) return IN_APP;
  if (!isPackaged) return UNSUPPORTED;
  if (platform === 'linux') return DOWNLOAD_PAGE;
  if (!updateConfig || !updateConfig.provider) return DOWNLOAD_PAGE;
  if (platform === 'darwin' && updateConfig.codeSigned !== true)
    return DOWNLOAD_PAGE;
  return IN_APP;
}

module.exports = {
  IN_APP,
  DOWNLOAD_PAGE,
  UNSUPPORTED,
  parseFlatYaml,
  updateConfigPath,
  readUpdateConfig,
  chooseUpdateMode
};
