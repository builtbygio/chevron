'use strict';

/**
 * Spec helpers time out on real time, not Date.now.
 *
 * spec-helper.js spies on Date.now and only advances it through advanceClock,
 * so a `conditionPromise` whose 5s guard read Date.now never timed out: a
 * false condition hung the suite until script/test's watchdog killed it,
 * with no message saying which wait it was (symbols-view, #432).
 *
 * Run: node --test script/ci/spec-helper-real-time.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function specHelperFiles() {
  const files = [path.join(ROOT, 'spec', 'async-spec-helpers.js')];
  const packages = path.join(ROOT, 'packages');
  for (const pkg of fs.readdirSync(packages)) {
    const dir = path.join(packages, pkg, 'spec');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (/helper/i.test(name) && name.endsWith('.js')) files.push(path.join(dir, name));
    }
  }
  return files;
}

describe('spec helper timeouts', () => {
  it('measure elapsed time with performance.now', () => {
    const offenders = specHelperFiles().filter(file =>
      /startTime\s*=\s*Date\.now\(\)|Date\.now\(\)\s*-\s*startTime/.test(fs.readFileSync(file, 'utf8'))
    );
    assert.deepStrictEqual(offenders.map(f => path.relative(ROOT, f)), []);
  });
});
