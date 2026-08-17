'use strict';

/**
 * H3 PR 23 slice 3 — chevron:// is the product URI scheme; atom:// is a
 * deprecated alias that still resolves.
 * Run: node --test script/ci/uri-scheme.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('URI scheme (PR 23.3)', () => {
  it('the handler registry accepts chevron: as well as atom:', () => {
    const src = read('src/uri-handler-registry.js');
    assert.match(src, /protocol !== 'chevron:'/);
    assert.match(src, /protocol !== 'atom:'/);
  });

  it('warns once when an atom:// URI is handled', () => {
    const src = read('src/uri-handler-registry.js');
    assert.match(src, /_warnedAtomScheme/);
    assert.match(src, /deprecated alias/);
  });

  it('default-protocol registration leads with chevron', () => {
    const src = read('src/protocol-handler-installer.js');
    // isDefaultProtocolClient must ask about chevron, not atom.
    const isDefault = src.slice(
      src.indexOf('async isDefaultProtocolClient'),
      src.indexOf('async setAsDefaultProtocolClient')
    );
    assert.match(isDefault, /protocol: 'chevron'/);
    assert.ok(
      !/protocol: 'atom'/.test(isDefault),
      'isDefaultProtocolClient should no longer key off atom'
    );
    // setAsDefaultProtocolClient still registers atom as a best-effort alias.
    assert.match(src, /protocol: 'atom'/);
    assert.match(src, /return chevronOk;/);
  });

  it('no longer claims dual-support forever', () => {
    const src = read('src/protocol-handler-installer.js');
    assert.ok(
      !/dual-support forever/.test(src),
      'Chevron-only policy: strike the dual-support wording (D2/N3)'
    );
  });

  it('user-facing protocol copy says chevron://', () => {
    const src = read('src/config-schema.js');
    const block = src.slice(
      src.indexOf('uriHandlerRegistration'),
      src.indexOf('themes:')
    );
    assert.match(block, /chevron:\/\//);
    assert.ok(
      !/default atom:\/\/ URI handler/.test(block),
      'prompt copy should lead with chevron://'
    );
  });

  it('default openers resolve both spellings', () => {
    const src = read('src/atom-environment.js');
    assert.match(src, /chevron:\/\/\.chevron\/config/);
    // atom:// and the .atom/ path segment are normalised, not enumerated.
    assert.match(src, /replace\(\/\^atom:/);
  });
});
