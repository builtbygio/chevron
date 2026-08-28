'use strict';

/**
 * The docs-only CI filter decides whether the five-platform build matrix runs.
 * A false positive means a change ships with no build verification at all.
 *
 * This exists because the inline version did exactly that. It piped the file
 * list into `grep -qvE` under `set -o pipefail`: grep exited on the first
 * match, closed the pipe, printf took SIGPIPE, pipefail turned the pipeline
 * into a failure, and the negation read that failure as "docs-only".
 *
 * It only misfired when the list was long enough for grep to exit before
 * printf finished — so **the larger the change, the likelier CI skipped
 * verifying it**. A 1570-file PR skipped all five build jobs.
 *
 * Run: node --test script/ci/docs-only-filter.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'script', 'ci', 'docs-only-changed.sh');

function classify(paths) {
  return cp
    .execFileSync(SCRIPT, { input: paths.join('\n'), encoding: 'utf8' })
    .trim();
}

describe('docs-only CI filter', () => {
  it('treats a docs-only change as docs-only', () => {
    assert.strictEqual(
      classify(['docs/README.md', 'CHANGELOG.md', 'docs/reference/x.md']),
      'true'
    );
  });

  it('treats any code file as code', () => {
    assert.strictEqual(classify(['package.json', 'docs/a.md']), 'false');
    assert.strictEqual(classify(['src/workspace.js']), 'false');
    assert.strictEqual(classify(['.github/workflows/ci.yml']), 'false');
  });

  it('does not change its answer with the size of the change', () => {
    // The regression: identical shape, 5000 files instead of 2.
    const big = ['package.json'];
    for (let i = 0; i < 5000; i++) big.push(`packages/p/lib/f${i}.js`);
    assert.strictEqual(
      classify(big),
      'false',
      'a large changeset containing code must still run the build'
    );

    const bigDocs = [];
    for (let i = 0; i < 5000; i++) bigDocs.push(`docs/reference/f${i}.md`);
    assert.strictEqual(classify(bigDocs), 'true');
  });

  it('treats an empty diff as code (fail safe)', () => {
    assert.strictEqual(classify([]), 'false');
  });

  it('ci.yml uses the script rather than an inline pipeline', () => {
    const ci = fs.readFileSync(
      path.join(ROOT, '.github', 'workflows', 'ci.yml'),
      'utf8'
    );
    assert.ok(ci.includes('script/ci/docs-only-changed.sh'));
    assert.ok(
      !ci.includes("grep -qvE '(^docs/"),
      'the inline grep -q pipeline must not come back'
    );
  });
});
