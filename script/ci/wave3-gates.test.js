'use strict';

/**
 * Wave 3 deletes an Atom shim only when a grep proves zero callers.
 * Task passed that gate and is gone (script/ci/task-callers.test.js).
 * The other three failed it, each for a concrete reason recorded here, so a
 * later session does not re-derive the search — or delete one on a hunch.
 * Run: node --test script/ci/wave3-gates.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function pkgJson() {
  return JSON.parse(read('package.json'));
}

describe('Wave 3 gates', () => {
  it('season stays: user .cson dual-read and third-party package data', () => {
    // Wave 1 proved all 94 pins and the app tree ship zero .cson
    // (script/ci/pin-cson.test.js). That was never the blocker. season still
    // reads user-authored ~/.chevron files and any installed package's data.
    assert.ok(pkgJson().dependencies.season, 'season must stay');
    for (const rel of [
      'src/config-file.js',
      'src/user-config-path.js',
      'src/keymap-extensions.ts',
      'src/package.js',
      'src/grammar-registry.js'
    ]) {
      assert.match(read(rel), /require\('season'\)/, `${rel} still reads CSON`);
    }
  });

  it('document-register-element stays: custom elements under contextIsolation', () => {
    assert.ok(pkgJson().dependencies['document-register-element']);
    assert.match(read('static/index.js'), /document-register-element/);
  });

  it('atom:// was the one gate Wave 4 reopened and closed', () => {
    // Wave 3 verdict: stays, because image-view shipped
    // atom://image-view/images/transparent-background.png in its LESS.
    // Wave 4 converted that pin (0.64.3) and deleted the alias.
    // script/ci/uri-scheme.test.js is the live gate now.
    const less = path.join(
      ROOT,
      'node_modules',
      'image-view',
      'styles',
      'image-view.less'
    );
    if (fs.existsSync(less)) {
      const src = fs.readFileSync(less, 'utf8');
      assert.doesNotMatch(src, /atom:\/\//);
      assert.match(src, /chevron:\/\/image-view\//);
    }
    const handler = read('src/main-process/atom-protocol-handler.js');
    assert.match(handler, /registerScheme\('chevron'\)/);
  });

  it('link clicks hand the URI to the registry unchanged', () => {
    // handleLinkClick used to rewrite chevron:// to atom://, so canonical
    // links tripped the registry's deprecated-alias warning. Both the rewrite
    // and the alias are gone.
    const src = read('src/window-event-handler.js');
    assert.doesNotMatch(src, /'atom:\/\/' \+ uri\.slice/);
    assert.match(src, /handleURI\(uri\)/);
    assert.doesNotMatch(src, /startsWith\('atom:\/\/'\)/);
  });
});
