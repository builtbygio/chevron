'use strict';

/**
 * Workspace.scan default is ripgrep; scandal is an explicit escape.
 * Run: node --test script/ci/search-engine.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const {
  resolveScanEngine,
  logScanEngineOnce,
  _resetLogForTests
} = require('../../src/search-engine');

describe('resolveScanEngine', () => {
  it('defaults omitted options.ripgrep to ripgrep', () => {
    assert.strictEqual(resolveScanEngine({}), 'ripgrep');
    assert.strictEqual(resolveScanEngine(), 'ripgrep');
  });

  it('honours options.ripgrep true/false', () => {
    assert.strictEqual(resolveScanEngine({ ripgrep: true }), 'ripgrep');
    assert.strictEqual(resolveScanEngine({ ripgrep: false }), 'scandal');
  });

  it('CHEVRON_SEARCH_ENGINE=scandal forces scandal', () => {
    assert.strictEqual(
      resolveScanEngine({ ripgrep: true }, { CHEVRON_SEARCH_ENGINE: 'scandal' }),
      'scandal'
    );
  });

  it('CHEVRON_SEARCH_ENGINE=ripgrep forces ripgrep even if flag is false', () => {
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
    logScanEngineOnce('scandal', msg => lines.push(msg));
    assert.deepStrictEqual(lines, ['searcher=ripgrep']);
  });
});
