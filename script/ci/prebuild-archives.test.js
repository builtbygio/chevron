'use strict';

/**
 * Language-server prebuilds arrive in four shapes; all four have to unpack.
 *
 *   raw binary      written straight to the destination
 *   gzipped binary  rust-analyzer
 *   tar.gz          harper-ls
 *   zip             clangd, whose binary sits at clangd_<version>/bin/clangd
 *
 * Only the first two worked. A .tar.gz was gunzipped onto the destination,
 * leaving a tar archive where an executable belonged; a zip was expanded into
 * the destination's directory, so a nested member never reached the flat path
 * the command names. Both reported success.
 *
 * Fixtures are built here and handed to ensureLanguageServerBinary through its
 * fetchImpl hook, so this exercises the real unpacking with no network.
 *
 * Run: node --test script/ci/prebuild-archives.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');
const {
  ensureLanguageServerBinary
} = require(path.join(ROOT, 'cpm', 'lib', 'language-server-prebuild.js'));
const tar = require(path.join(ROOT, 'cpm', 'node_modules', 'tar'));

const SCRIPT = '#!/bin/sh\necho hello\n';

function makePackage(dir, extra = {}) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'chevron-lsp-fixture',
        version: '1.0.0',
        chevron: {
          languageServer: Object.assign(
            {
              id: 'fixture',
              scopes: ['source.fixture'],
              command: 'bin/fixture-ls',
              args: [],
              prebuilds: { [`${process.platform}-${process.arch}`]: 'https://example.invalid/a' }
            },
            extra
          )
        }
      },
      null,
      2
    )
  );
}

const fetchReturning = buffer => async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  )
});

function tarGzWith(memberPath) {
  const staging = makeTempDir('tar-stage-');
  const full = path.join(staging, memberPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, SCRIPT, { mode: 0o755 });
  const archive = path.join(staging, 'out.tar');
  tar.c({ file: archive, cwd: staging, sync: true }, [memberPath.split(path.sep)[0]]);
  const gz = zlib.gzipSync(fs.readFileSync(archive));
  removeTempDir(staging);
  return gz;
}

function zipWith(memberPath) {
  const staging = makeTempDir('zip-stage-');
  const full = path.join(staging, memberPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, SCRIPT, { mode: 0o755 });
  const archive = path.join(staging, 'out.zip');
  const top = memberPath.split(path.sep)[0];
  const result = spawnSync('zip', ['-q', '-r', archive, top], { cwd: staging });
  const buffer = result.status === 0 ? fs.readFileSync(archive) : null;
  removeTempDir(staging);
  return buffer;
}

describe('prebuild archive shapes', () => {
  it('writes a raw binary', async () => {
    const dir = makeTempDir('prebuild-raw-');
    try {
      makePackage(dir);
      const out = await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(Buffer.from(SCRIPT))
      });
      assert.equal(out.ok, true, out.reason);
      assert.equal(fs.readFileSync(path.join(dir, 'bin', 'fixture-ls'), 'utf8'), SCRIPT);
    } finally {
      removeTempDir(dir);
    }
  });

  it('gunzips a bare gzipped binary (rust-analyzer)', async () => {
    const dir = makeTempDir('prebuild-gz-');
    try {
      makePackage(dir);
      const out = await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(zlib.gzipSync(Buffer.from(SCRIPT)))
      });
      assert.equal(out.ok, true, out.reason);
      assert.equal(fs.readFileSync(path.join(dir, 'bin', 'fixture-ls'), 'utf8'), SCRIPT);
    } finally {
      removeTempDir(dir);
    }
  });

  it('extracts a .tar.gz and finds the binary inside (harper-ls)', async () => {
    const dir = makeTempDir('prebuild-targz-');
    try {
      makePackage(dir);
      const out = await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(tarGzWith(path.join('harper-ls-1.0', 'fixture-ls')))
      });
      assert.equal(out.ok, true, out.reason);
      const written = path.join(dir, 'bin', 'fixture-ls');
      assert.ok(fs.existsSync(written), 'the binary must land at the command path');
      assert.equal(fs.readFileSync(written, 'utf8'), SCRIPT, 'not a tar file');
    } finally {
      removeTempDir(dir);
    }
  });

  it('extracts a zip whose binary is nested (clangd)', async () => {
    const zipped = zipWith(path.join('fixture_1.0', 'bin', 'fixture-ls'));
    if (!zipped) return; // no zip binary on this host
    const dir = makeTempDir('prebuild-zip-');
    try {
      makePackage(dir);
      const out = await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(zipped)
      });
      assert.equal(out.ok, true, out.reason);
      const written = path.join(dir, 'bin', 'fixture-ls');
      assert.ok(fs.existsSync(written), 'a nested member must reach the flat path');
      assert.equal(fs.readFileSync(written, 'utf8'), SCRIPT);
    } finally {
      removeTempDir(dir);
    }
  });

  it('honours an explicit archivePath', async () => {
    const dir = makeTempDir('prebuild-explicit-');
    try {
      // The member is named something else entirely, so only archivePath can
      // find it.
      makePackage(dir, { archivePath: path.join('pkg-2.0', 'server-binary') });
      const out = await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(tarGzWith(path.join('pkg-2.0', 'server-binary')))
      });
      assert.equal(out.ok, true, out.reason);
      assert.equal(
        fs.readFileSync(path.join(dir, 'bin', 'fixture-ls'), 'utf8'),
        SCRIPT
      );
    } finally {
      removeTempDir(dir);
    }
  });

  it('reports the archive contents when the binary is not found', async () => {
    const dir = makeTempDir('prebuild-missing-');
    try {
      makePackage(dir);
      const out = await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(tarGzWith(path.join('other-1.0', 'unrelated')))
      });
      assert.equal(out.ok, false, 'a missing binary must not report success');
      assert.match(String(out.reason), /archivePath/);
    } finally {
      removeTempDir(dir);
    }
  });

  it('leaves no unpack directory behind', async () => {
    const dir = makeTempDir('prebuild-clean-');
    try {
      makePackage(dir);
      await ensureLanguageServerBinary(dir, {
        fetchImpl: fetchReturning(tarGzWith(path.join('x-1.0', 'fixture-ls')))
      });
      const leftovers = fs
        .readdirSync(path.join(dir, 'bin'))
        .filter(n => n.endsWith('.unpack') || n.endsWith('.gz') || n.endsWith('.zip'));
      assert.deepEqual(leftovers, []);
    } finally {
      removeTempDir(dir);
    }
  });
});
