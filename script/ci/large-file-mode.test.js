'use strict';

/**
 * Large-file mode (core.largeFileModeThreshold, #428): what keeps a big file
 * cheap. Opening, the badge and switching back are covered by
 * spec/workspace-spec.js, spec/project-spec.js and the status-bar spec.
 *
 * Run: node --test script/ci/large-file-mode.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

// text-buffer pulls in pathwatcher, built for Electron's ABI, not node's.
const Point = (row, column) => ({ row, column });
Point.fromObject = point => point;
const STUBS = {
  'text-buffer': { Point, Range: (start, end) => ({ start, end }) }
};

function loadTs(file) {
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const dir = path.dirname(file);
  const localRequire = id => {
    if (STUBS[id]) return STUBS[id];
    if (!id.startsWith('.')) return require(id);
    const resolved = path.resolve(dir, id);
    return fs.existsSync(`${resolved}.ts`)
      ? loadTs(`${resolved}.ts`)
      : require(resolved);
  };
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

describe('large-file mode', () => {
  it('is a setting, on at 5 MB by default', () => {
    const schema = require(path.join(ROOT, 'src', 'config-schema'));
    const setting = schema.core.properties.largeFileModeThreshold;
    assert.strictEqual(setting.type, 'number');
    assert.strictEqual(setting.default, 5);
    assert.strictEqual(setting.minimum, 0);
    assert.ok(
      setting.default < schema.core.properties.warnOnLargeFileLimit.default,
      'large-file mode has to start below the size that asks before opening'
    );
  });

  it('has no folds: folding all of a big file by indentation is quadratic', () => {
    const PlainTextLanguageMode = loadTs(
      path.join(ROOT, 'src', 'plain-text-language-mode.ts')
    );
    const lines = ['a {', '  b', '}'];
    const buffer = {
      getLineCount: () => lines.length,
      lineForRow: row => lines[row]
    };
    const folding = new PlainTextLanguageMode(buffer, null);
    const foldless = new PlainTextLanguageMode(buffer, null, { folding: false });

    assert.strictEqual(folding.isFoldableAtRow(0), true);
    assert.strictEqual(foldless.isFoldableAtRow(0), false);
    assert.deepStrictEqual(foldless.getFoldableRanges(2), []);
    assert.deepStrictEqual(foldless.getFoldableRangesAtIndentLevel(0, 2), []);
  });

  it('never sends the file to a language server', () => {
    const { DocumentSync } = require(path.join(ROOT, 'src', 'lsp', 'document-sync'));
    const sent = [];
    const sync = new DocumentSync({
      notify: (...args) => sent.push(args),
      getServerIdForEditor: () => 'server-1'
    });
    const editor = {
      isLargeFileMode: () => true,
      getPath: () => '/tmp/big.log',
      getGrammar: () => ({ scopeName: 'text.plain.null-grammar' }),
      getText: () => 'x'.repeat(10)
    };

    sync.observeEditor(editor);
    assert.deepStrictEqual(sent, []);
  });

  it('starts no server for it, so no "no language server" notice either', () => {
    const source = read('src/lsp/index.js');
    const body = source.slice(source.indexOf('async function ensureServerForEditor'));
    const firstLines = body.split('\n').slice(0, 3).join('\n');
    assert.match(firstLines, /if \(isLargeFileMode\(editor\)\) return null;/);
    assert.match(source, /editor\.whenFullFeatures\(start\)/);
  });

  // The packages #428 lists. Each one waits for the editor to leave the mode
  // (whenFullFeatures) or checks it where the work starts (isLargeFileMode).
  const gated = {
    'packages/lsp-ui/lib/inlay-hints.js': /whenFullFeatures/,
    'packages/breadcrumbs/lib/main.js': /whenFullFeatures/,
    'packages/sticky-scroll/lib/main.js': /whenFullFeatures/,
    'packages/bracket-matcher/lib/main.js': /whenFullFeatures/,
    'packages/spell-check/lib/main.ts': /whenFullFeatures/,
    'packages/git-diff/lib/main.js': /whenFullFeatures/,
    'packages/find-and-replace/lib/find-view.ts': /isLargeFileMode\(\)\) return;/
  };
  for (const [file, pattern] of Object.entries(gated)) {
    it(`${file} leaves large files alone`, () => {
      assert.match(read(file), pattern);
    });
  }

  it('keeps the null grammar resolvable, so the override survives', () => {
    assert.match(
      read('src/grammar-registry.js'),
      /if \(languageId === NullGrammar\.scopeName\) return NullGrammar;/
    );
  });
});
