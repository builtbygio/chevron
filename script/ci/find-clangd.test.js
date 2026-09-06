'use strict';

/**
 * clangd is found on macOS and Windows too, not only where it is on PATH.
 *
 * The lookup moved from packages/chevron-lsp-c into src/lsp/builtin-servers.js
 * on 2026-09-06: once cpm installs that package it is community code, and
 * looking at /usr/bin needs `fs`, which is blocked. The assertions below moved
 * with it — the behaviour they protect is unchanged.
 *
 * The registry resolves a bare command name with which(), which searches PATH
 * and nothing else. That finds clangd on most Linux installs and misses it on
 * the other two platforms, where it is commonly installed and commonly not on
 * PATH:
 *
 *   macOS    Xcode and the command line tools carry it inside the toolchain,
 *            and Homebrew keeps llvm keg-only
 *   Windows  the LLVM installer does not always add its bin directory
 *
 * These assertions run on every platform by driving the lookup lists directly,
 * since the CI host only has one of the three.
 *
 * Run: node --test script/ci/find-clangd.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'src', 'lsp', 'builtin-servers.js');
const {
  resolveSystemClangd,
  clangdDirectories,
  versionedLlvmDirectories
} = require(MODULE);
const source = fs.readFileSync(MODULE, 'utf8');

describe('clangd lookup', () => {
  it('returns a real executable when one exists here', () => {
    const found = resolveSystemClangd();
    if (!found) return; // no clangd on this host; the absence path is tested below
    assert.ok(fs.existsSync(found), `${found} must exist`);
    assert.ok(fs.statSync(found).isFile());
  });

  it('prefers PATH before the well-known locations', () => {
    // PATH is what the user chose; a bundled Xcode copy should not win over it.
    const body = source.slice(source.indexOf('function resolveSystemClangd'));
    const pathIndex = body.indexOf('which(CLANGD_EXE)');
    const wellKnownIndex = body.indexOf('clangdDirectories()');
    assert.ok(pathIndex > -1, 'PATH is searched');
    assert.ok(wellKnownIndex > pathIndex, 'the well-known list comes after PATH');
  });

  it('covers the macOS locations that are not on PATH', () => {
    for (const needle of [
      '/Library/Developer/CommandLineTools/usr/bin',
      'XcodeDefault.xctoolchain',
      '/opt/homebrew/opt/llvm/bin',
      '/usr/local/opt/llvm/bin'
    ]) {
      assert.ok(source.includes(needle), `${needle} must be searched on darwin`);
    }
  });

  it('covers the Windows locations, and the .exe suffix', () => {
    for (const needle of ['LLVM', 'ProgramFiles', 'LOCALAPPDATA', 'scoop']) {
      assert.ok(source.includes(needle), `${needle} must be searched on win32`);
    }
    assert.match(source, /clangd\.exe/);
  });

  it('picks the highest versioned LLVM directory, not the first listed', () => {
    // Debian ships /usr/lib/llvm-14, -15, -16 side by side.
    assert.match(source, /sort\(\(a, b\) => b\.version - a\.version\)/);
  });

  it('does not spawn anything to find it', () => {
    // A file check is cheap and needs no privileged require; xcrun would be
    // both slower and a child_process dependency in a T2 package.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    assert.ok(
      !/child_process|spawn\(|execSync/.test(code),
      'strip comments first: the module explains that it does not spawn, and ' +
        'a naive scan matches that explanation'
    );
  });

  it('lists candidate directories for the running platform', () => {
    const dirs = clangdDirectories();
    assert.ok(Array.isArray(dirs) && dirs.length > 0);
    for (const dir of dirs) assert.equal(typeof dir, 'string');
  });
});

describe('the package registers what it found', () => {
  const main = fs.readFileSync(
    path.join(ROOT, 'packages', 'chevron-lsp-c', 'lib', 'main.js'),
    'utf8'
  );

  it('registers the resolved absolute path, not the bare name', () => {
    // Registering "clangd" would put the registry back on PATH-only lookup.
    assert.match(main, /command: found\.command/);
    assert.ok(!/command: 'clangd'/.test(main));
  });

  it('says so, once, when nothing is found', () => {
    assert.match(main, /no clangd was found/);
    assert.match(main, /INSTALL_HINT/);
  });

  it('carries an install hint for each platform', () => {
    for (const platform of ['darwin', 'linux', 'win32']) {
      assert.match(main, new RegExp(platform + ':'));
    }
  });
});
