'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadLanguageModule,
  unwrapLanguage,
  isEsmRequireError
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
      isEsmRequireError({ message: 'Must use import to load ES Module' }),
      true
    );
    assert.strictEqual(isEsmRequireError({ code: 'MODULE_NOT_FOUND' }), false);
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

  it('installed tree-sitter matches package.json (not the old DeeDeeG 0.17 fork)', () => {
    const declared = require('../../package.json').dependencies['tree-sitter'];
    const installed = require('../../node_modules/tree-sitter/package.json')
      .version;
    assert.strictEqual(
      installed,
      declared,
      `node_modules/tree-sitter is ${installed}, expected ${declared}. Official language-* grammars cannot colour files on 0.17.`
    );
  });
});
