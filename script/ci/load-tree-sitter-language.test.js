'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadLanguageModule,
  unwrapLanguage,
  isEsmRequireError,
  fileLooksLikeEsm,
  onDiskPackageRoot
} = require('../../src/load-tree-sitter-language');

function write(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

describe('load-tree-sitter-language', () => {
  it('unwraps { language } and ESM default exports', () => {
    const inner = { id: 'lang' };
    assert.strictEqual(unwrapLanguage({ language: inner }), inner);
    assert.strictEqual(unwrapLanguage({ default: inner }), inner);
    assert.strictEqual(
      unwrapLanguage({ default: { language: inner } }),
      inner
    );
    assert.strictEqual(unwrapLanguage(inner), inner);
  });

  it('keeps official CJS grammar modules that carry nodeTypeInfo', () => {
    const language = { native: true };
    const mod = { name: 'c', language, nodeTypeInfo: [{ type: 'translation_unit' }] };
    assert.strictEqual(unwrapLanguage(mod), mod);
    const esm = { default: mod };
    assert.strictEqual(unwrapLanguage(esm), mod);
  });

  it('detects ESM require errors', () => {
    assert.strictEqual(
      isEsmRequireError({ code: 'ERR_REQUIRE_ESM' }),
      true
    );
    assert.strictEqual(
      isEsmRequireError({ code: 'ERR_REQUIRE_ASYNC_MODULE' }),
      true
    );
    assert.strictEqual(
      isEsmRequireError({ message: 'Must use import to load ES Module' }),
      true
    );
    assert.strictEqual(
      isEsmRequireError({
        name: 'SyntaxError',
        message: 'Cannot use import statement outside a module'
      }),
      true
    );
    assert.strictEqual(
      isEsmRequireError({ message: "Cannot use 'import.meta' outside a module" }),
      true
    );
    assert.strictEqual(isEsmRequireError({ code: 'MODULE_NOT_FOUND' }), false);
  });

  it('detects ESM syntax without type:module (tree-sitter-perl)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-esm-detect-'));
    const esmFile = path.join(root, 'index.js');
    write(
      esmFile,
      'import { readFileSync } from "node:fs";\nexport default {};\n'
    );
    assert.strictEqual(fileLooksLikeEsm(esmFile), true);
    const cjsFile = path.join(root, 'cjs.js');
    write(cjsFile, 'module.exports = { fromCjs: true };\n');
    assert.strictEqual(fileLooksLikeEsm(cjsFile), false);
  });

  it('rewrites app.asar package roots to app.asar.unpacked when present', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-asar-'));
    const asarPkg = path.join(
      root,
      'app.asar',
      'node_modules',
      'tree-sitter-perl'
    );
    const unpackedPkg = path.join(
      root,
      'app.asar.unpacked',
      'node_modules',
      'tree-sitter-perl'
    );
    write(path.join(unpackedPkg, 'build', 'Release', 'x.node'), '');
    assert.strictEqual(onDiskPackageRoot(asarPkg), unpackedPkg);
    assert.strictEqual(onDiskPackageRoot(unpackedPkg), unpackedPkg);
    const missing = path.join(root, 'app.asar', 'node_modules', 'nope');
    assert.strictEqual(onDiskPackageRoot(missing), missing);
  });

  it('require()s a CJS grammar parser as-is', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-cjs-'));
    const pkg = path.join(root, 'node_modules', 'tree-sitter-cjs-fixture');
    write(
      path.join(pkg, 'package.json'),
      JSON.stringify({ name: 'tree-sitter-cjs-fixture', main: 'bindings/node' })
    );
    write(
      path.join(pkg, 'bindings', 'node', 'index.js'),
      'module.exports = { fromCjs: true };\n'
    );
    const grammarPath = path.join(root, 'grammars', 'x.cson');
    write(grammarPath, 'scopeName: source.x\n');

    const loaded = loadLanguageModule('tree-sitter-cjs-fixture', grammarPath);
    assert.strictEqual(loaded.fromCjs, true);
  });

  it('loads an ESM grammar via node-gyp-build', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-esm-'));
    const pkg = path.join(root, 'node_modules', 'tree-sitter-esm-fixture');
    write(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: 'tree-sitter-esm-fixture',
        type: 'module',
        main: 'bindings/node'
      })
    );
    write(
      path.join(pkg, 'bindings', 'node', 'index.js'),
      // Match tree-sitter-css@0.25: ESM + top-level await → ERR_REQUIRE_ASYNC_MODULE
      'const binding = (await import("node-gyp-build")).default("/nope");\n' +
        'export default binding;\n'
    );
    write(
      path.join(root, 'node_modules', 'node-gyp-build', 'package.json'),
      JSON.stringify({ name: 'node-gyp-build', main: 'index.js' })
    );
    write(
      path.join(root, 'node_modules', 'node-gyp-build', 'index.js'),
      'module.exports = (pkgRoot) => ({ fromNgb: true, pkgRoot });\n'
    );
    const grammarPath = path.join(root, 'grammars', 'x.cson');
    write(grammarPath, 'scopeName: source.x\n');

    const loaded = loadLanguageModule('tree-sitter-esm-fixture', grammarPath);
    assert.strictEqual(loaded.fromNgb, true);
    assert.strictEqual(loaded.pkgRoot, pkg);
  });

  it('loads ESM-without-type:module via node-gyp-build (tree-sitter-perl)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-perl-esm-'));
    const pkg = path.join(root, 'node_modules', 'tree-sitter-perl-fixture');
    write(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: 'tree-sitter-perl-fixture',
        main: 'bindings/node'
      })
    );
    write(path.join(pkg, 'binding.gyp'), '{ "targets": [] }\n');
    write(
      path.join(pkg, 'bindings', 'node', 'index.js'),
      'import { readFileSync } from "node:fs";\n' +
        'const root = fileURLToPath(new URL("../..", import.meta.url));\n' +
        'const binding = (await import("node-gyp-build")).default(root);\n' +
        'export default binding;\n'
    );
    write(
      path.join(root, 'node_modules', 'node-gyp-build', 'package.json'),
      JSON.stringify({ name: 'node-gyp-build', main: 'index.js' })
    );
    write(
      path.join(root, 'node_modules', 'node-gyp-build', 'index.js'),
      'module.exports = (pkgRoot) => ({ fromNgb: true, pkgRoot });\n'
    );
    const grammarPath = path.join(root, 'grammars', 'x.json');
    write(grammarPath, '{"scopeName":"source.x"}\n');

    const loaded = loadLanguageModule('tree-sitter-perl-fixture', grammarPath);
    assert.strictEqual(loaded.fromNgb, true);
    assert.strictEqual(loaded.pkgRoot, pkg);
  });

  it('falls back to node-gyp-build when require throws SyntaxError on an addon', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-syntax-'));
    const pkg = path.join(root, 'node_modules', 'tree-sitter-syntax-fixture');
    write(
      path.join(pkg, 'package.json'),
      JSON.stringify({
        name: 'tree-sitter-syntax-fixture',
        main: 'bindings/node'
      })
    );
    write(path.join(pkg, 'binding.gyp'), '{ "targets": [] }\n');
    write(
      path.join(pkg, 'bindings', 'node', 'index.js'),
      'throw Object.assign(new SyntaxError("Cannot use import statement outside a module"), { code: undefined });\n'
    );
    write(
      path.join(root, 'node_modules', 'node-gyp-build', 'package.json'),
      JSON.stringify({ name: 'node-gyp-build', main: 'index.js' })
    );
    write(
      path.join(root, 'node_modules', 'node-gyp-build', 'index.js'),
      'module.exports = (pkgRoot) => ({ fromNgb: true, pkgRoot });\n'
    );
    const grammarPath = path.join(root, 'grammars', 'x.json');
    write(grammarPath, '{"scopeName":"source.x"}\n');

    const loaded = loadLanguageModule(
      'tree-sitter-syntax-fixture',
      grammarPath
    );
    assert.strictEqual(loaded.fromNgb, true);
    assert.strictEqual(loaded.pkgRoot, pkg);
  });

  it('does not call DeeDeeG method-style hasChanges()', () => {
    const mode = fs.readFileSync(
      path.join(__dirname, '../../src/tree-sitter-language-mode.js'),
      'utf8'
    );
    assert.ok(
      !/\.hasChanges\s*\(/.test(mode),
      'tree-sitter 0.25 exposes hasChanges as a boolean getter'
    );
  });

  it('lockfile pins official tree-sitter, not the DeeDeeG 0.17 fork', () => {
    const declared = require('../../package.json').dependencies['tree-sitter'];
    assert.strictEqual(declared, '0.25.1');
    const { entriesFor } = require('../lib/lockfile-packages');
    const hits = entriesFor(path.join(__dirname, '../..'), 'tree-sitter');
    const pinned = hits.find(h => h.version === '0.25.1' || h.key.includes('0.25.1'));
    assert.ok(pinned, 'lockfile must list tree-sitter@0.25.1');
    assert.ok(
      !/DeeDeeG/i.test(pinned.resolved || pinned.key),
      `expected npm registry tree-sitter, got ${pinned.resolved || pinned.key}`
    );
    const installedPath = path.join(
      __dirname,
      '../../node_modules/tree-sitter/package.json'
    );
    if (fs.existsSync(installedPath)) {
      const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
      assert.strictEqual(
        installed.version,
        '0.25.1',
        `node_modules/tree-sitter is ${installed.version}, expected 0.25.1`
      );
    }
  });
});
