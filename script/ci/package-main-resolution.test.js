'use strict';

/**
 * A package whose main is a .js file can be loaded.
 *
 * Package.getMainModulePath resolved with
 *
 *   fs.resolveExtension(mainModulePath, ['', ...CompileCache.supportedExtensions])
 *
 * and supportedExtensions is the list of extensions that need a *compiler*,
 * which is a different question from which extensions can be *loaded*. It held
 * '.js' while babel was among the compilers; once the only compilers were
 * TypeScript it became ['.ts', '.tsx'], and `main: "./lib/main"` stopped
 * resolving to lib/main.js.
 *
 * Bundled packages were unaffected -- they take the packagesCache branch -- so
 * this broke only installed packages, every one of them, with mainModulePath
 * undefined and no error raised. `cpm install` put a package on disk that the
 * editor then reported as active while its main module had never loaded.
 *
 * Run: node --test script/ci/package-main-resolution.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'package.js'), 'utf8');
const CompileCache = require(path.join(ROOT, 'src', 'compile-cache.js'));

describe('main module resolution', () => {
  it('tries .js and .json independently of the compiler list', () => {
    // Anchor on the definition, not the first call site.
    const start = PACKAGE_SOURCE.indexOf('  getMainModulePath() {');
    assert.ok(start > -1, 'getMainModulePath must still exist');
    // Bounded slice: `return this.mainModulePath;` also appears on the
    // early-return line immediately below, so it is not a usable end anchor.
    const block = PACKAGE_SOURCE.slice(start, start + 2000);
    assert.match(block, /'\.js'/, "'.js' must be tried; most packages ship one");
    assert.match(block, /'\.json'/);
  });

  it('the compiler list alone would not resolve a .js main', () => {
    // The condition that caused the bug, asserted directly so that a future
    // change to COMPILERS cannot quietly reintroduce it.
    assert.ok(
      !CompileCache.supportedExtensions.includes('.js'),
      'if .js ever returns to the compiler list this test is stale, but the ' +
        'resolution list must still name it explicitly'
    );
  });

  it('resolveExtension finds a .js main with the corrected list', () => {
    const fsPlus = require(path.join(ROOT, 'node_modules', 'fs-plus'));
    // makeTempDir, not mkdtempSync: it registers the directory for removal on
    // exit and on a signal (script/ci/temp-dir-hygiene.test.js enforces it).
    const dir = makeTempDir('main-resolve-');
    try {
      fs.mkdirSync(path.join(dir, 'lib'));
      fs.writeFileSync(path.join(dir, 'lib', 'main.js'), 'module.exports = {};\n');
      const target = path.join(dir, 'lib', 'main');

      const withCompilerListOnly = fsPlus.resolveExtension(target, [
        '',
        ...CompileCache.supportedExtensions
      ]);
      assert.equal(
        withCompilerListOnly,
        null,
        'this is what the editor was doing: lib/main.js never resolved'
      );

      const corrected = fsPlus.resolveExtension(target, [
        '',
        '.js',
        '.json',
        ...CompileCache.supportedExtensions
      ]);
      assert.equal(corrected, path.join(dir, 'lib', 'main.js'));
    } finally {
      removeTempDir(dir);
    }
  });
});

describe('cpm install', () => {
  const { compareVersions } = require(path.join(
    ROOT, 'cpm', 'lib', 'commands', 'install.js'
  ));

  it('orders versions so a downgrade is recognisable', () => {
    assert.equal(compareVersions('0.1.0', '0.0.9'), 1);
    assert.equal(compareVersions('0.0.9', '0.1.0'), -1);
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
    assert.equal(compareVersions('1.10.0', '1.9.0'), 1, 'numeric, not lexical');
    assert.equal(compareVersions('2.0.0-beta', '2.0.0'), 0, 'prerelease ignored');
  });

  it('is registered in the CLI', () => {
    const cli = fs.readFileSync(path.join(ROOT, 'cpm', 'lib', 'cli.js'), 'utf8');
    assert.match(cli, /\.command\('install <path>'\)/);
    assert.match(cli, /--force/);
  });

  it('copies rather than links', () => {
    // A link makes the editor load a working directory, which is right for
    // developing a package and wrong for installing one.
    const src = fs.readFileSync(
      path.join(ROOT, 'cpm', 'lib', 'commands', 'install.js'),
      'utf8'
    );
    assert.match(src, /fs\.copy\(/);
    assert.ok(!/fs\.symlink\(/.test(src), 'install must not symlink');
  });

  it('skips node_modules when copying', () => {
    // The source is a workspace member: its dependencies are hoisted
    // elsewhere, so whatever is nested there is not what the package needs.
    const src = fs.readFileSync(
      path.join(ROOT, 'cpm', 'lib', 'commands', 'install.js'),
      'utf8'
    );
    assert.match(src, /filter:.*node_modules/s);
  });
});
