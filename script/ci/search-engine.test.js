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
