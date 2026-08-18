'use strict';

/**
 * H3 PR 23.3 — bundled packages publish chevron:// URIs, not atom://.
 * Run: node --test script/ci/no-atom-uri.test.js
 *
 * Core still accepts atom:// (Workspace retries the alternate scheme, and the
 * protocol handler registers both), so user deep links keep working. This
 * guards the *packages*, which is what has to be clean before that fallback
 * can be removed.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function scan(dir) {
  try {
    const out = cp.execSync(
      `grep -rn "atom://" ${dir} 2>/dev/null || true`,
      { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
    ).trim();
    return out ? out.split('\n') : [];
  } catch (_) {
    return [];
  }
}

describe('bundled packages publish chevron:// URIs (PR 23.3)', () => {
  it('no in-repo package emits an atom:// URI', () => {
    const hits = [];
    for (const pkg of fs.readdirSync(path.join(ROOT, 'packages'))) {
      for (const sub of ['lib', 'src']) {
        const dir = path.join(ROOT, 'packages', pkg, sub);
        if (fs.existsSync(dir)) hits.push(...scan(dir));
      }
    }
    assert.deepStrictEqual(
      hits.map(h => h.replace(ROOT + '/', '')),
      [],
      'use chevron:// in bundled package code'
    );
  });

  it('no owned pin emits an atom:// URI', () => {
    const deps =
      JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
        .dependencies || {};
    const hits = [];
    for (const [name, spec] of Object.entries(deps)) {
      if (!/builtbygio/.test(String(spec))) continue;
      const root = path.join(ROOT, 'node_modules', name);
      if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) continue;
      for (const sub of ['lib', 'src']) {
        const dir = path.join(root, sub);
        if (fs.existsSync(dir)) hits.push(...scan(dir));
      }
    }
    assert.deepStrictEqual(
      hits.map(h => h.replace(ROOT + '/', '')),
      [],
      'use chevron:// in owned pin code'
    );
  });

  it('core still accepts atom:// so existing links keep working', () => {
    const ws = fs.readFileSync(path.join(ROOT, 'src/workspace.js'), 'utf8');
    assert.match(ws, /alternateSchemeURI/);
    const registry = fs.readFileSync(
      path.join(ROOT, 'src/uri-handler-registry.js'),
      'utf8'
    );
    assert.match(registry, /protocol !== 'atom:'/);
  });
});
