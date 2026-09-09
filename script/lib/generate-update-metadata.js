'use strict';

/**
 * latest*.yml for electron-updater, from the artifacts a job produced.
 *
 * electron-builder writes this file itself for the installers it builds
 * (Windows). The macOS zip is made by script/mac-universal, so its
 * latest-mac.yml is written here in the same shape: version, one entry per
 * file with its sha512 (base64) and size, `path`/`sha512` for the first file
 * (older updaters), and the release date.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function sha512Base64(filePath) {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('base64');
}

function describeArtifact(filePath) {
  return {
    url: path.basename(filePath),
    sha512: sha512Base64(filePath),
    size: fs.statSync(filePath).size
  };
}

function buildUpdateInfo({ version, files, releaseDate = new Date() }) {
  if (!version) throw new Error('update metadata needs a version');
  if (!files || files.length === 0)
    throw new Error('update metadata needs at least one file');
  const lines = [`version: ${version}`, 'files:'];
  for (const file of files) {
    lines.push(
      `  - url: ${file.url}`,
      `    sha512: ${file.sha512}`,
      `    size: ${file.size}`
    );
  }
  lines.push(
    `path: ${files[0].url}`,
    `sha512: ${files[0].sha512}`,
    `releaseDate: '${new Date(releaseDate).toISOString()}'`
  );
  return lines.join('\n') + '\n';
}

// electron-updater fetches `${channel}.yml`, and on macOS `${channel}-mac.yml`.
function channelFileName(platform, channel = 'latest') {
  return platform === 'darwin' ? `${channel}-mac.yml` : `${channel}.yml`;
}

function writeUpdateMetadata({
  outDir,
  platform,
  version,
  artifactPaths,
  channel
}) {
  const file = path.join(outDir, channelFileName(platform, channel));
  const files = artifactPaths.map(describeArtifact);
  fs.writeFileSync(file, buildUpdateInfo({ version, files }));
  return file;
}

module.exports = {
  sha512Base64,
  describeArtifact,
  buildUpdateInfo,
  channelFileName,
  writeUpdateMetadata
};
