'use strict';

/**
 * latest-mac.yml has the shape electron-updater parses: version, one entry
 * per file with base64 sha512 and size, path/sha512 of the first file, and
 * a release date.
 *
 * Run: node --test script/ci/update-metadata.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { makeTempDir } = require(path.join(ROOT, 'script', 'lib', 'temp-dir'));
const meta = require(path.join(
  ROOT,
  'script',
  'lib',
  'generate-update-metadata'
));

describe('update metadata', () => {
  it('names the channel file the way electron-updater asks for it', () => {
    assert.equal(meta.channelFileName('darwin'), 'latest-mac.yml');
    assert.equal(meta.channelFileName('win32'), 'latest.yml');
    assert.equal(meta.channelFileName('darwin', 'beta'), 'beta-mac.yml');
  });

  it('writes the file from the artifacts', () => {
    const out = makeTempDir('chevron-update-metadata-test-');
    const zip = path.join(out, 'chevron-mac-universal.zip');
    fs.writeFileSync(zip, 'not really a zip');
    const file = meta.writeUpdateMetadata({
      outDir: out,
      platform: 'darwin',
      version: '1.4.0',
      artifactPaths: [zip]
    });
    assert.equal(path.basename(file), 'latest-mac.yml');
    const text = fs.readFileSync(file, 'utf8');
    const sha512 = crypto
      .createHash('sha512')
      .update('not really a zip')
      .digest('base64');
    assert.equal(
      text
        .split('\n')
        .slice(0, 7)
        .join('\n'),
      [
        'version: 1.4.0',
        'files:',
        '  - url: chevron-mac-universal.zip',
        `    sha512: ${sha512}`,
        '    size: 16',
        'path: chevron-mac-universal.zip',
        `sha512: ${sha512}`
      ].join('\n')
    );
    assert.match(text, /^releaseDate: '\d{4}-\d{2}-\d{2}T[^']+'\n$/m);
  });

  it('refuses to describe nothing', () => {
    assert.throws(
      () => meta.buildUpdateInfo({ version: '1.0.0', files: [] }),
      /at least one file/
    );
    assert.throws(() => meta.buildUpdateInfo({ files: [{}] }), /version/);
  });
});
