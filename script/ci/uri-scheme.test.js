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

  // The renderer registry above was converted in Wave 4; main's openUrl was
  // not, and every external chevron:// link was dropped (#406).
  it('main-process URL opening accepts chevron:, not atom:', () => {
    const src = read('src/main-process/atom-application.js');
    const openUrl = src.slice(src.indexOf('  openUrl({'));
    const body = openUrl.slice(0, openUrl.indexOf('\n  }\n'));
    assert.match(body, /protocol !== 'chevron:'/);
    assert.doesNotMatch(src, /protocol (!==|===) 'atom:'/);
  });

  it('packages that open URI links accept chevron:, not atom:', () => {
    assert.doesNotMatch(read('packages/link/lib/link.js'), /'atom:'/);
    assert.match(read('packages/link/lib/link.js'), /protocol === 'chevron:'/);
    const card = read('packages/settings-view/lib/package-card.js');
    assert.doesNotMatch(card, /startsWith\("atom:"\)/);
  });

  it('the settings URI panel goes through core\'s installer, not atom', () => {
    const panel = read('packages/settings-view/lib/uri-handler-panel.js');
    assert.doesNotMatch(panel, /["']atom["']/);
    assert.match(panel, /chevron\.protocolHandlerInstaller/);
  });

  // #408: `await !promise` negates the Promise, so the check was always false.
  it('the installer awaits the default-client check before negating it', () => {
    const src = read('src/protocol-handler-installer.js');
    assert.doesNotMatch(src, /await\s*!/);
    assert.match(src, /!\(await this\.isDefaultProtocolClient\(\)\)/);
  });

  it('the deprecation warning is gone with the alias it warned about', () => {
    const src = read('src/uri-handler-registry.js');
    assert.doesNotMatch(src, /_warnedAtomScheme/);
  });

  it('registers chevron and withdraws the stale atom registration', () => {
    const src = read('src/protocol-handler-installer.js');
    assert.match(src, /protocol: 'chevron'/);
    // `atom` may appear only in the removal call — earlier versions registered
    // it, so leaving the OS pointed at a scheme we no longer handle would send
    // links into a dead end.
    assert.match(src, /chevron:remove-as-default-protocol-client/);
    const setBlock = src.slice(src.indexOf('async setAsDefaultProtocolClient'));
    const removeIdx = setBlock.indexOf('chevron:remove-as-default-protocol-client');
    const setIdx = setBlock.indexOf("invoke('chevron:set-as-default-protocol-client'");
    assert.ok(removeIdx !== -1 && setIdx > removeIdx, 'remove runs before set');
    assert.doesNotMatch(
      setBlock.slice(setIdx),
      /protocol: 'atom'/,
      'atom must not be re-registered'
    );

    // Main must actually handle the channel, and only for known schemes.
    const main = read('src/main-process/atom-application.js');
    assert.match(main, /ipcMain\.handle\(\s*'chevron:remove-as-default-protocol-client'/);
    // Only chevron may be checked or registered; atom may only be withdrawn
    // (#407: the settings panel was registering atom).
    assert.match(main, /REGISTRABLE_PROTOCOLS = new Set\(\['chevron'\]\)/);
    assert.match(main, /REMOVABLE_PROTOCOLS = new Set\(\['chevron', 'atom'\]\)/);
    assert.match(main, /'removeAsDefaultProtocolClient',\s*REMOVABLE_PROTOCOLS/);
    const ipc = read('src/main-process/register-renderer-ipc.js');
    assert.match(ipc, /REGISTRABLE_PROTOCOLS = new Set\(\['chevron'\]\)/);
    // And the executable is main's own, never one the renderer supplied.
    assert.match(main, /execPath: process\.execPath/);
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

  it('openers no longer try an alternate spelling or host', () => {
    const ws = read('src/workspace.js');
    assert.doesNotMatch(ws, /alternateSchemeURI/);

    const env = read('src/atom-environment.js');
    assert.match(env, /chevron:\/\/\.chevron\/config/);
    assert.doesNotMatch(env, /replace\(\/\^atom:/);
    // The `.atom` host normalization went too, once welcome and
    // snippets@1.5.6 stopped using that spelling.
    assert.doesNotMatch(env, /\\\.atom\\\//);
  });

  it('the CLI opens chevron:// and drops atom:// instead of pathing it', () => {
    const src = read('src/main-process/parse-command-line.js');
    assert.match(src, /startsWith\('chevron:\/\/'\)/);
    // A stale OS association still hands us atom:// args. Without an explicit
    // branch these fall through to pathsToOpen and the app tries to open a
    // file literally named `atom://…`.
    assert.match(src, /startsWith\('atom:\/\/'\)/);
    const from = src.indexOf("startsWith('atom://')");
    const branch = src.slice(from, src.indexOf('} else {', from));
    assert.ok(branch.length > 0, 'expected an else-if branch for atom://');
    assert.doesNotMatch(
      branch,
      /pathsToOpen\.push/,
      'an atom:// arg must not be treated as a path'
    );
    assert.match(branch, /console\.warn/, 'say why it was ignored');
  });
});
