'use strict';

/**
 * app-update.yml round-trips between the build script that writes it and the
 * main process that reads it, and the update mode follows from what it says.
 *
 * Run: node --test script/ci/update-config.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { makeTempDir } = require(path.join(ROOT, 'script', 'lib', 'temp-dir'));
const writer = require(path.join(ROOT, 'script', 'lib', 'update-config-file'));
const reader = require(path.join(ROOT, 'src', 'main-process', 'update-config'));

describe('githubRepoFromUrl', () => {
  it('reads owner and repo from the forms package.json uses', () => {
    for (const url of [
      'https://github.com/builtbygio/chevron.git',
      'https://github.com/builtbygio/chevron',
      'git@github.com:builtbygio/chevron.git',
      'git+https://github.com/builtbygio/chevron.git'
    ]) {
      assert.deepEqual(
        writer.githubRepoFromUrl(url),
        { owner: 'builtbygio', repo: 'chevron' },
        url
      );
    }
    assert.equal(writer.githubRepoFromUrl('https://gitlab.com/a/b'), null);
    assert.equal(writer.githubRepoFromUrl(undefined), null);
  });

  it('matches the repository this package.json names', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
    assert.deepEqual(writer.githubRepoFromUrl(pkg.repository.url), {
      owner: 'builtbygio',
      repo: 'chevron'
    });
  });
});

describe('app-update.yml', () => {
  it('is written flat and read back the same by both sides', () => {
    const text = writer.buildUpdateConfig({
      owner: 'builtbygio',
      repo: 'chevron',
      codeSigned: false
    });
    assert.equal(
      text,
      'provider: github\nowner: builtbygio\nrepo: chevron\nupdaterCacheDirName: chevron-updater\ncodeSigned: false\n'
    );
    const expected = {
      provider: 'github',
      owner: 'builtbygio',
      repo: 'chevron',
      updaterCacheDirName: 'chevron-updater',
      codeSigned: false
    };
    assert.deepEqual(writer.parseUpdateConfig(text), expected);
    assert.deepEqual(reader.parseFlatYaml(text), expected);
  });

  it('quotes a value electron-updater would otherwise misread', () => {
    const text = writer.buildUpdateConfig({
      owner: 'o',
      repo: 'r',
      codeSigned: true,
      publisherName: 'Chevron Contributors, Inc.'
    });
    assert.match(text, /publisherName: "Chevron Contributors, Inc\."/);
    assert.equal(
      reader.parseFlatYaml(text).publisherName,
      'Chevron Contributors, Inc.'
    );
    assert.equal(reader.parseFlatYaml(text).codeSigned, true);
  });

  it('refuses to write a feed with no repository', () => {
    assert.throws(
      () => writer.buildUpdateConfig({ owner: 'o' }),
      /owner and repo/
    );
  });

  it('is marked signed in place, before codesign seals it', () => {
    const resources = makeTempDir('chevron-update-config-test-');
    writer.writeUpdateConfig(resources, {
      owner: 'builtbygio',
      repo: 'chevron'
    });
    assert.equal(reader.readUpdateConfig(resources).codeSigned, false);
    writer.markUpdateConfigSigned(resources, { publisherName: 'Someone' });
    const config = reader.readUpdateConfig(resources);
    assert.equal(config.codeSigned, true);
    assert.equal(config.publisherName, 'Someone');
    assert.equal(config.provider, 'github', 'the rest survives');
  });

  it('reads as absent when the file is not there', () => {
    assert.equal(
      reader.readUpdateConfig(makeTempDir('chevron-update-config-test-')),
      null
    );
  });

  it('tolerates comments and quoting in the parser', () => {
    assert.deepEqual(
      reader.parseFlatYaml("# feed\nprovider: 'github' # yes\nempty:\n"),
      {
        provider: 'github',
        empty: null
      }
    );
  });
});

describe('chooseUpdateMode', () => {
  const signed = { provider: 'github', codeSigned: true };
  const unsigned = { provider: 'github', codeSigned: false };

  it('installs in-app on a signed macOS build and on Windows', () => {
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'darwin',
        isPackaged: true,
        updateConfig: signed
      }),
      'in-app'
    );
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'win32',
        isPackaged: true,
        updateConfig: unsigned
      }),
      'in-app'
    );
  });

  it('keeps an unsigned macOS build on the download page, since Squirrel.Mac would refuse it', () => {
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'darwin',
        isPackaged: true,
        updateConfig: unsigned
      }),
      'download-page'
    );
  });

  it('leaves Linux to its package manager', () => {
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'linux',
        isPackaged: true,
        updateConfig: signed
      }),
      'download-page'
    );
  });

  it('falls back to the page when a packaged build has no feed file', () => {
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'win32',
        isPackaged: true,
        updateConfig: null
      }),
      'download-page'
    );
  });

  it('does nothing in a source checkout', () => {
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'darwin',
        isPackaged: false,
        updateConfig: null
      }),
      'unsupported'
    );
  });

  it('lets a feed URL in the environment force in-app, for testing against a local server', () => {
    assert.equal(
      reader.chooseUpdateMode({
        platform: 'linux',
        isPackaged: false,
        updateConfig: null,
        env: { CHEVRON_UPDATE_FEED_URL: 'http://localhost:9000/' }
      }),
      'in-app'
    );
  });
});
