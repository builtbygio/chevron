'use strict';

/**
 * Unsigned-preview update check against GitHub Releases.
 * Squirrel/electron autoUpdater is not used here (unsigned builds cannot
 * install that way). The product update URL is the Releases page.
 */

const DEFAULT_RELEASES_URL = 'https://github.com/builtbygio/chevron/releases';
const DEFAULT_API_URL =
  'https://api.github.com/repos/builtbygio/chevron/releases';

function normalizeTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/^v/i, '');
}

function parseSemver(version) {
  const m = normalizeTag(version).match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** @returns {number} 1 if a>b, -1 if a<b, 0 if equal or unparsable */
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
  return 0;
}

function isNewerRelease(remoteTag, localVersion) {
  return compareSemver(remoteTag, localVersion) > 0;
}

function pickLatestRelease(releases) {
  if (!Array.isArray(releases)) return null;
  return releases.find(r => r && r.draft !== true && r.tag_name) || null;
}

function summarizeRelease(release) {
  if (!release) return null;
  return {
    tag: normalizeTag(release.tag_name),
    rawTag: release.tag_name,
    htmlUrl: release.html_url,
    name: release.name,
    prerelease: Boolean(release.prerelease)
  };
}

module.exports = {
  DEFAULT_RELEASES_URL,
  DEFAULT_API_URL,
  normalizeTag,
  parseSemver,
  compareSemver,
  isNewerRelease,
  pickLatestRelease,
  summarizeRelease
};
