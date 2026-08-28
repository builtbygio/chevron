'use strict';

/**
 * Wave 4 — `chevron://` is the only product URI scheme. The `atom://` alias
 * is gone from core, from the app's own menu URIs, and from the macOS
 * CFBundleURLSchemes.
 *
 * The gate that allowed this: a sweep of all 94 owned pins found zero shipped
 * `atom://` emitters once image-view 0.64.3 converted its LESS asset URL.
 * Run: node --test script/ci/uri-scheme.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('URI scheme (Wave 4)', () => {
  it('the handler registry accepts only chevron:', () => {
    const src = read('src/uri-handler-registry.js');
    assert.match(src, /protocol !== 'chevron:'/);
    assert.doesNotMatch(src, /protocol !== 'atom:'/);
    assert.doesNotMatch(src, /protocol === 'atom:'/);
  });

  it('the deprecation warning is gone with the alias it warned about', () => {
    const src = read('src/uri-handler-registry.js');
    assert.doesNotMatch(src, /_warnedAtomScheme/);
  });

  it('only chevron is registered as a protocol client', () => {
    const src = read('src/protocol-handler-installer.js');
    assert.match(src, /protocol: 'chevron'/);
    assert.doesNotMatch(src, /protocol: 'atom'/);
  });

  it('the main-process protocol handler serves only chevron', () => {
    const src = read('src/main-process/atom-protocol-handler.js');
    assert.match(src, /registerScheme\('chevron'\)/);
    assert.doesNotMatch(src, /\['atom', 'chevron'\]/);

    const paths = read('src/main-process/atom-protocol-path.js');
    assert.doesNotMatch(paths, /startsWith\('atom:\/\/'\)/);
    assert.match(paths, /startsWith\('chevron:\/\/'\)/);
  });

  it('no longer claims dual-support forever', () => {
    const src = read('src/protocol-handler-installer.js');
    assert.ok(!/dual-support forever/.test(src));
  });

  it('user-facing protocol copy says chevron://', () => {
    const src = read('src/config-schema.js');
    const block = src.slice(
      src.indexOf('uriHandlerRegistration'),
      src.indexOf('themes:')
    );
    assert.match(block, /chevron:\/\//);
    assert.doesNotMatch(block, /atom:\/\//);
  });

  it('the app opens its own menu URIs as chevron://', () => {
    // These were atom://about, atom://config and five atom://.atom/* paths.
    // Missing one would have broken About or Settings with the alias gone.
    const src = read('src/main-process/atom-application.js');
    for (const uri of [
      'chevron://about',
      'chevron://config',
      'chevron://.chevron/config',
      'chevron://.chevron/init-script',
      'chevron://.chevron/keymap',
      'chevron://.chevron/snippets',
      'chevron://.chevron/stylesheet'
    ]) {
      assert.ok(src.includes(`'${uri}'`), `${uri} should be opened by name`);
    }
    assert.doesNotMatch(src, /'atom:\/\//);
  });

  it('macOS declares only the chevron URL scheme', () => {
    const plist = read('resources/mac/atom-Info.plist');
    const block = plist.slice(
      plist.indexOf('CFBundleURLSchemes'),
      plist.indexOf('CFBundleDocumentTypes')
    );
    assert.match(block, /<string>chevron<\/string>/);
    assert.doesNotMatch(block, /<string>atom<\/string>/);
  });

  it('openers no longer try an alternate spelling', () => {
    const ws = read('src/workspace.js');
    assert.doesNotMatch(ws, /alternateSchemeURI/);

    const env = read('src/atom-environment.js');
    assert.match(env, /chevron:\/\/\.chevron\/config/);
    assert.doesNotMatch(env, /replace\(\/\^atom:/);
    // The `.atom` *host* spelling is a separate legacy surface and stays.
    assert.match(env, /\\\.atom\\\//);
  });

  it('the CLI treats only chevron:// as a URL', () => {
    const src = read('src/main-process/parse-command-line.js');
    assert.match(src, /startsWith\('chevron:\/\/'\)/);
    assert.doesNotMatch(src, /startsWith\('atom:\/\/'\)/);
  });
});
