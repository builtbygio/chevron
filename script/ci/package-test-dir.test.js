'use strict';

/**
 * A package counts as testable only when its spec/test folder holds specs.
 *
 * bookmarks, encoding-selector and status-bar have a spec folder with only
 * fixtures in it; both script/test and jasmine.yml counted them, they ran
 * zero specs, and their suites passed.
 *
 * Run: node --test script/ci/package-test-dir.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { packageTestDir } = require('../lib/package-test-dir');
const { makeTempDir } = require('../lib/temp-dir');

function makePackage(files) {
  const root = makeTempDir('pkg-test-dir-');
  for (const file of files) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, '');
  }
  return root;
}

describe('packageTestDir', () => {
  it('finds a spec folder with specs', () => {
    assert.strictEqual(packageTestDir(makePackage(['spec/foo-spec.js'])), 'spec');
  });

  it('finds nested and test-runner layouts', () => {
    assert.strictEqual(packageTestDir(makePackage(['spec/a/b/bar-spec.ts'])), 'spec');
    assert.strictEqual(packageTestDir(makePackage(['test/thing.test.js'])), 'test');
    assert.strictEqual(packageTestDir(makePackage(['spec/binding.spec.js'])), 'spec');
  });

  it('ignores a folder holding only fixtures', () => {
    assert.strictEqual(packageTestDir(makePackage(['spec/fixtures/sample-spec.js', 'spec/fixtures/a.txt'])), null);
  });

  it('ignores helpers that are not specs', () => {
    assert.strictEqual(packageTestDir(makePackage(['spec/helpers.js'])), null);
  });

  it('every package the repo tests resolves to a folder', () => {
    const root = path.resolve(__dirname, '..', '..');
    for (const name of ['welcome', 'fuzzy-finder', 'autocomplete-plus']) {
      assert.ok(packageTestDir(path.join(root, 'packages', name)), name);
    }
  });
});
