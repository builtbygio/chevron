'use strict';

/**
 * Wave 4 — nothing shipped may emit an `atom://` URI, in a package or in core.
 *
 * This used to scan only `lib/` and `src/`, which is why it never saw the one
 * emitter that actually mattered: `image-view/styles/image-view.less`. It now
 * walks the whole package, skipping only spec/test trees, docs and binaries.
 * Run: node --test script/ci/no-atom-uri.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'spec', 'specs', 'test', 'tests']);
const SKIP_EXT = /\.(png|jpe?g|gif|ico|icns|node|ttf|woff2?|zip|gz|tgz|map|md)$/i;

function emittersIn(root) {
  const hits = [];
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) return hits;
  const walk = dir => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (SKIP_EXT.test(ent.name)) continue;
      let src;
      try {
        src = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      if (src.includes('atom://')) hits.push(path.relative(ROOT, full));
    }
  };
  walk(root);
  return hits;
}

describe('nothing shipped emits atom:// (Wave 4)', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );

  it('no owned pin emits an atom:// URI', () => {
    const names = Object.keys(pkg.packageDependencies || {});
    // Guard against a sweep that scans nothing (an empty or broken catalog
    // read would otherwise pass silently). A loose floor on purpose: the
    // catalog is curated, so pinning its exact size just breaks on every trim.
    assert.ok(names.length >= 50, `catalog read returned only ${names.length} packages`);
    const hits = [];
    for (const name of names) {
      const root = ['packages', 'node_modules']
        .map(d => path.join(ROOT, d, name))
        .find(fs.existsSync);
      if (root) hits.push(...emittersIn(root));
    }
    assert.deepStrictEqual(hits, [], 'use chevron:// in owned pin code');
  });

  it('core emits no atom:// URI', () => {
    const hits = [];
    for (const dir of ['src', 'static', 'exports', 'menus', 'keymaps']) {
      for (const hit of emittersIn(path.join(ROOT, dir))) {
        for (const line of fs
          .readFileSync(path.join(ROOT, hit), 'utf8')
          .split('\n')) {
          if (!line.includes('atom://')) continue;
          // Prose in a comment is fine.
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
          // Recognising an atom:// argument in order to reject it is fine;
          // emitting one is not.
          if (/startsWith\('atom:\/\/'\)/.test(line)) continue;
          if (/Ignoring|was removed/.test(line)) continue;
          hits.push(`${hit}: ${line.trim()}`);
        }
      }
    }
    assert.deepStrictEqual(hits, [], 'core must open chevron:// URIs');
  });

  it('core no longer accepts atom:// either', () => {
    // Wave 4 removed the alias outright; script/ci/uri-scheme.test.js is the
    // detailed gate.
    const ws = fs.readFileSync(path.join(ROOT, 'src/workspace.js'), 'utf8');
    assert.doesNotMatch(ws, /alternateSchemeURI/);
    const registry = fs.readFileSync(
      path.join(ROOT, 'src/uri-handler-registry.js'),
      'utf8'
    );
    assert.doesNotMatch(registry, /protocol !== 'atom:'/);
  });
});
