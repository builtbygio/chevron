'use strict';

/**
 * H3 PR 23 stream — bundled package code uses the `chevron` global, not `atom`.
 * Run: node --test script/ci/no-atom-global.test.js
 *
 * Scoped to in-repo `packages/` for now. The 38 owned `builtbygio` pins are
 * being converted one repo at a time; when that stream finishes, widen this to
 * node_modules and `global.atom` itself can finally be dropped from
 * initialize-application-window.js.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');
const SOURCE_EXT = /\.(js|jsx|ts|tsx)$/;

/** Bare `atom.` that is a real identifier, not `.atom.`, `chevron.atom.`, … */
const BARE_ATOM = /(?<![.\w$-])atom\.(?=[a-zA-Z_$])/;

/** Blank out string literals so selectors and filenames don't false-positive. */
function maskStrings(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, m => '\0'.repeat(m.length));
}

function isComment(line) {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (SOURCE_EXT.test(entry.name)) acc.push(full);
  }
  return acc;
}

describe('bundled packages use the chevron global (PR 23 stream)', () => {
  it('no in-repo package reads the bare `atom` global', () => {
    const hits = [];
    for (const pkg of fs.readdirSync(PACKAGES)) {
      // lib/ and src/ are shipped code. Specs still run under a harness where
      // `atom` is defined, and converting them is not what this guards.
      for (const sub of ['lib', 'src']) {
        for (const file of walk(path.join(PACKAGES, pkg, sub), [])) {
          const text = fs.readFileSync(file, 'utf8');
          text.split('\n').forEach((line, i) => {
            if (isComment(line)) return;
            if (BARE_ATOM.test(maskStrings(line))) {
              hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
            }
          });
        }
      }
    }
    assert.deepStrictEqual(
      hits,
      [],
      'Use the `chevron` global in bundled package code:\n' +
        hits.map(h => `  ${h}`).join('\n')
    );
  });

  it('string literals and comments are not rewritten', () => {
    // Two real cases this guard must tolerate, both found during the
    // conversion: a CSS filename and a command selector.
    assert.ok(!BARE_ATOM.test(maskStrings("resolveStylesheet('../static/atom.less')")));
    assert.ok(!BARE_ATOM.test(maskStrings('commands.add("atom-text-editor", …)')));
    assert.ok(isComment('    // atom.autoUpdater.onUpdateAvailable =>'));
    // …and one that must still be caught.
    assert.ok(BARE_ATOM.test(maskStrings('  const x = atom.workspace.getPaths()')));
  });
});
