'use strict';

/**
 * Workspace.scan is ripgrep only. Scandal search is gone (H1 PR 4).
 * Run: node --test script/ci/search-engine.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  resolveScanEngine,
  logScanEngineOnce,
  _resetLogForTests
} = require('../../src/search-engine');

const ROOT = path.resolve(__dirname, '..', '..');

describe('resolveScanEngine', () => {
  it('is always ripgrep', () => {
    assert.strictEqual(resolveScanEngine({}), 'ripgrep');
    assert.strictEqual(resolveScanEngine(), 'ripgrep');
    assert.strictEqual(resolveScanEngine({ ripgrep: true }), 'ripgrep');
    assert.strictEqual(resolveScanEngine({ ripgrep: false }), 'ripgrep');
  });

  it('ignores CHEVRON_SEARCH_ENGINE=scandal', () => {
    assert.strictEqual(
      resolveScanEngine({ ripgrep: true }, { CHEVRON_SEARCH_ENGINE: 'scandal' }),
      'ripgrep'
    );
  });

  it('CHEVRON_SEARCH_ENGINE=ripgrep is still ripgrep', () => {
    assert.strictEqual(
      resolveScanEngine({ ripgrep: false }, { CHEVRON_SEARCH_ENGINE: 'ripgrep' }),
      'ripgrep'
    );
  });
});

describe('logScanEngineOnce', () => {
  beforeEach(() => _resetLogForTests());

  it('logs searcher= once', () => {
    const lines = [];
    logScanEngineOnce('ripgrep', msg => lines.push(msg));
    logScanEngineOnce('ripgrep', msg => lines.push(msg));
    assert.deepStrictEqual(lines, ['searcher=ripgrep']);
  });
});

describe('the setting that chose an engine is gone too', () => {
  // `useRipgrep` outlived the choice it described: `scan` ignored it from
  // PR 4 on, so turning it off changed nothing while telling the user it
  // had. A setting whose only remaining effect was mislabelling a metric is
  // worse than no setting.
  it('find-and-replace does not offer useRipgrep', () => {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'packages', 'find-and-replace', 'package.json'),
        'utf8'
      )
    );
    assert.ok(pkg.configSchema, 'find-and-replace still has a config schema');
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(pkg.configSchema, 'useRipgrep'),
      false,
      'useRipgrep is back in the schema'
    );
    // enablePCRE2 is still honoured, so it should still be there.
    assert.ok(
      Object.prototype.hasOwnProperty.call(pkg.configSchema, 'enablePCRE2'),
      'enablePCRE2 should not have been removed with it'
    );
  });

  it('nothing reads it any more', () => {
    const searched = [
      path.join('packages', 'find-and-replace', 'lib', 'project', 'results-model.ts'),
      path.join('src', 'workspace.js'),
      path.join('src', 'search-engine.js')
    ];
    for (const relative of searched) {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      assert.ok(
        !source.includes('useRipgrep'),
        `${relative} still reads useRipgrep`
      );
    }
  });
});

describe('scandal search path is gone', () => {
  it('does not ship DefaultDirectorySearcher or scan-handler', () => {
    assert.strictEqual(
      fs.existsSync(path.join(ROOT, 'src', 'default-directory-searcher.js')),
      false
    );
    assert.strictEqual(
      fs.existsSync(path.join(ROOT, 'src', 'scan-handler.ts')),
      false
    );
    assert.strictEqual(
      fs.existsSync(path.join(ROOT, 'spec', 'default-directory-searcher-spec.js')),
      false
    );
  });
});
