'use strict';

/**
 * Every URI the app opens for a menu command must have a named owner, and that
 * owner must still contain the URI.
 *
 * This exists because Wave 4 broke "Open Your Snippets" and nothing caught it.
 * The menu moved to `chevron://.chevron/snippets`; core's default opener has no
 * case for snippets (it is the package's job); and the snippets package matched
 * only `chevron://.atom/snippets`. The deleted `atom://` fallback had been
 * silently bridging the two, so the command opened nothing, with no error.
 *
 * The owner table is explicit on purpose. Inferring "something opens this" from
 * a grep is unreliable: a package that merely *opens* a URI (welcome) looks
 * identical to one that *registers an opener* for it.
 *
 * Run: node --test script/ci/menu-uri-openers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// uri -> the pin that registers an opener for it, or 'core'.
const OWNERS = {
  'chevron://about': 'about',
  'chevron://config': 'settings-view',
  'chevron://.chevron/config': 'core',
  'chevron://.chevron/init-script': 'core',
  'chevron://.chevron/keymap': 'core',
  'chevron://.chevron/stylesheet': 'core',
  'chevron://.chevron/snippets': 'snippets'
};

function menuUris() {
  const src = read('src/main-process/atom-application.js');
  const uris = new Set();
  for (const m of src.matchAll(
    /openPathOnEvent\([\s\S]{0,80}?'(chevron:\/\/[^']+)'/g
  )) {
    uris.add(m[1]);
  }
  return [...uris].sort();
}

function pinRoot(name) {
  return ['packages', 'node_modules']
    .map(d => path.join(ROOT, d, name))
    .find(fs.existsSync);
}

function pinContains(name, uri) {
  const root = pinRoot(name);
  if (!root) return null; // not installed — caller decides
  for (const sub of ['lib', 'src']) {
    const dir = path.join(root, sub);
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        if (ent.name === 'node_modules') continue;
        const full = path.join(d, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!/\.(js|ts)$/.test(ent.name)) continue;
        let src;
        try {
          src = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        if (src.includes(`'${uri}'`) || src.includes(`"${uri}"`)) return true;
      }
    }
  }
  return false;
}

describe('menu URIs have openers', () => {
  const uris = menuUris();

  it('every menu URI is listed in the owner table', () => {
    assert.ok(uris.length >= 7, `only found ${uris.length}: ${uris}`);
    const unlisted = uris.filter(u => !OWNERS[u]);
    assert.deepStrictEqual(
      unlisted,
      [],
      `add these to OWNERS with the pin that opens them: ${unlisted}`
    );
  });

  it('core-owned URIs appear in the default opener switch', () => {
    const cases = new Set(
      [
        ...read('src/atom-environment.js').matchAll(
          /case '(chevron:\/\/[^']+)'/g
        )
      ].map(m => m[1])
    );
    for (const [uri, owner] of Object.entries(OWNERS)) {
      if (owner !== 'core') continue;
      assert.ok(cases.has(uri), `core opener has no case for ${uri}`);
    }
  });

  it('pin-owned URIs still appear in that pin', () => {
    const missing = [];
    for (const [uri, owner] of Object.entries(OWNERS)) {
      if (owner === 'core') continue;
      const found = pinContains(owner, uri);
      if (found === null) continue; // pin not installed in this job
      if (!found) missing.push(`${owner} no longer opens ${uri}`);
    }
    assert.deepStrictEqual(missing, [], missing.join('; '));
  });

  it('nothing uses the .atom host spelling any more', () => {
    assert.doesNotMatch(read('src/atom-environment.js'), /\.atom\\\//);
    for (const uri of [...uris, ...Object.keys(OWNERS)]) {
      assert.ok(!uri.startsWith('chevron://.atom/'), `${uri} uses .atom`);
    }
  });
});
