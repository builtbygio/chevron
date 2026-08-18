'use strict';

/**
 * H3 PR 23 stream — bundled package code uses the `chevron` global, not `atom`.
 * Run: node --test script/ci/no-atom-global.test.js
 *
 * Covers in-repo `packages/` and the owned `builtbygio` pins. Once this has
 * held through a dogfood cycle, `global.atom` can be dropped from
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

/**
 * Blank out string literals so selectors and filenames don't false-positive.
 *
 * `${...}` inside a template literal is **live code**, not string content, and
 * must survive masking. The bulk conversion missed four real call sites by
 * blanking backtick strings wholesale: `${atom.getVersion()}` and friends in
 * notifications, settings-view and timecop.
 */
function maskStrings(line) {
  return line
    .replace(/`(?:\\.|[^`])*`/g, tpl =>
      tpl.replace(/\$\{[^}]*\}|[\s\S]/g, seg =>
        seg.startsWith('${') ? seg : '\0'.repeat(seg.length)
      )
    )
    .replace(/(["'])(?:\\.|(?!\1).)*\1/g, m => '\0'.repeat(m.length));
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
  it('no bundled package reads the bare `atom` global', () => {
    const hits = [];
    const scan = (label, dirs) => {
      for (const dir of dirs) {
        for (const file of walk(dir, [])) {
          const text = fs.readFileSync(file, 'utf8');
          text.split('\n').forEach((line, i) => {
            if (isComment(line)) return;
            if (BARE_ATOM.test(maskStrings(line))) {
              hits.push(`${label} ${path.relative(ROOT, file)}:${i + 1}`);
            }
          });
        }
      }
    };

    for (const pkg of fs.readdirSync(PACKAGES)) {
      scan('in-repo', [
        path.join(PACKAGES, pkg, 'lib'),
        path.join(PACKAGES, pkg, 'src')
      ]);
    }

    // Owned builtbygio pins. Symlinked mirrors of packages/ are skipped so
    // they are not scanned twice under a different name.
    const deps =
      JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
        .dependencies || {};
    const NODE_MODULES = path.join(ROOT, 'node_modules');
    for (const [name, spec] of Object.entries(deps)) {
      if (!/builtbygio/.test(String(spec))) continue;
      const root = path.join(NODE_MODULES, name);
      if (!fs.existsSync(root)) continue;
      if (fs.lstatSync(root).isSymbolicLink()) continue;
      scan('pin', [path.join(root, 'lib'), path.join(root, 'src')]);
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
    // live code inside a template interpolation — the case the bulk
    // conversion originally missed
    assert.ok(BARE_ATOM.test(maskStrings('  const v = `v ${atom.getVersion()}`')));
    assert.ok(!BARE_ATOM.test(maskStrings('  const s = `see atom.foo for info`')));
  });
});
