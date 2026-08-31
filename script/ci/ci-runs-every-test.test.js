'use strict';

/**
 * Every test file under script/ci is actually run by CI.
 *
 * The workflow names each test file on its own `node --test` line rather than
 * globbing, which is deliberate -- some suites need a real node_modules, and
 * one needs the packaged app, so they run in different jobs at different
 * points. The cost is that adding a test file does not add it to CI, and
 * nothing says so: the suite passes locally, the PR goes green, and the
 * invariant it guards is unenforced.
 *
 * That is not hypothetical. theme-custom-properties.test.js and
 * theme-variables-eliminated.test.js -- the two suites holding the line on the
 * theming migration -- were written, merged, and never once executed by CI.
 * They were found only because a third file was about to join them.
 *
 * A green check is only evidence about what it actually ran.
 *
 * Run: node --test script/ci/ci-runs-every-test.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const WORKFLOW = path.join(ROOT, '.github', 'workflows', 'ci.yml');

describe('CI runs every test file', () => {
  it('names each script/ci/*.test.js somewhere in the workflow', () => {
    const workflow = fs.readFileSync(WORKFLOW, 'utf8');
    const referenced = new Set(
      [...workflow.matchAll(/script\/ci\/([A-Za-z0-9._-]+\.test\.js)/g)].map(
        m => m[1]
      )
    );
    const onDisk = fs
      .readdirSync(__dirname)
      .filter(name => name.endsWith('.test.js'))
      .sort();

    const unreferenced = onDisk.filter(name => !referenced.has(name));
    assert.deepEqual(
      unreferenced,
      [],
      'these exist but CI never runs them, so whatever they guard is ' +
        'unenforced:\n  ' + unreferenced.join('\n  ')
    );
  });

  it('does not name a test file that no longer exists', () => {
    const workflow = fs.readFileSync(WORKFLOW, 'utf8');
    const referenced = [
      ...new Set(
        [...workflow.matchAll(/script\/ci\/([A-Za-z0-9._-]+\.test\.js)/g)].map(
          m => m[1]
        )
      )
    ].sort();
    const missing = referenced.filter(
      name => !fs.existsSync(path.join(__dirname, name))
    );
    assert.deepEqual(
      missing,
      [],
      'the workflow runs these and they are gone; the job fails on a ' +
        'missing file rather than on anything real:\n  ' + missing.join('\n  ')
    );
  });
});
