'use strict';

/**
 * The search arguments the renderer builds must be ones main will accept.
 *
 * These are two halves of one contract that never met in a test.
 * `RipgrepDirectorySearcher` builds an argv; `register-rg-ipc` validates it and
 * refuses anything that is not a nul-free string. Pushing a number — which is
 * what the context-line options were — fails that check, and the failure is
 * invisible: the IPC promise rejects, the rejection never reaches the results
 * model, and project search reports zero matches with no error.
 *
 * Since `find-and-replace.searchContextLineCountBefore` and `…After` both
 * default to 3, that made Find in Project return nothing on a default install.
 *
 * So: build args the way the searcher does, and hand them to the real
 * validator.
 *
 * Run: node --test script/ci/rg-search-args.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const RipgrepDirectorySearcher = require(path.join(
  ROOT,
  'src',
  'ripgrep-directory-searcher'
));
const registerRgIpc = require(path.join(
  ROOT,
  'src',
  'main-process',
  'register-rg-ipc'
));

// The validator main actually uses, not a copy of its rules.
const { validateArgs } = registerRgIpc.createRgSearchManager({
  ipcMain: { handle() {}, on() {} },
  webContentsFor: () => null
});

const searcher = new RipgrepDirectorySearcher();
const DIR = path.join(path.sep, 'repo', 'a');

function build(options = {}, regexp = /findMe/g) {
  return searcher.buildArgs(
    DIR,
    regexp,
    searcher.prepareRegexp(regexp.source),
    Object.assign({ inclusions: [], exclusions: [] }, options)
  );
}

describe('every argument is a string', () => {
  it('with the context line counts find-and-replace sends by default', () => {
    // These default to 3, which is the whole bug: a number here was rejected
    // by main and the search silently returned nothing.
    const args = build({
      leadingContextLineCount: 3,
      trailingContextLineCount: 3
    });
    const wrong = args.filter(arg => typeof arg !== 'string');
    assert.deepStrictEqual(
      wrong,
      [],
      `non-string arguments: ${JSON.stringify(wrong)}`
    );
    assert.ok(args.includes('--before-context'));
    assert.ok(args.includes('3'), 'the count travels as a string');
  });

  it('with every option turned on at once', () => {
    const args = build(
      {
        leadingContextLineCount: 2,
        trailingContextLineCount: 5,
        inclusions: ['src'],
        exclusions: ['node_modules'],
        includeHidden: true,
        follow: true,
        excludeVcsIgnores: false,
        PCRE2: true
      },
      /findMe/gi
    );
    assert.deepStrictEqual(args.filter(a => typeof a !== 'string'), []);
  });
});

describe('main accepts what the searcher builds', () => {
  const cases = [
    ['no options', {}],
    ['context counts (the default shape)', {
      leadingContextLineCount: 3,
      trailingContextLineCount: 3
    }],
    ['zero context counts', {
      leadingContextLineCount: 0,
      trailingContextLineCount: 0
    }],
    ['globs', { inclusions: ['lib'], exclusions: ['dist'] }],
    ['hidden and follow', { includeHidden: true, follow: true }],
    ['pcre2', { PCRE2: true }]
  ];

  for (const [name, options] of cases) {
    it(name, () => {
      const result = validateArgs(build(options));
      assert.strictEqual(
        result.ok,
        true,
        `main rejected the searcher's own arguments: ${result.reason}`
      );
    });
  }

  it('and still rejects what it should', () => {
    // The validator is a boundary; the fix was to satisfy it, not loosen it.
    assert.strictEqual(validateArgs(['--json', '--regexp', 3, '.']).ok, false);
    assert.strictEqual(
      validateArgs(['--json', '--regexp', 'a\0b', '.']).ok,
      false
    );
    assert.strictEqual(validateArgs(['--json', '--regexp', 'x']).ok, false, 'must end at "."');
  });
});
