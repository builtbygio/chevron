'use strict';

/**
 * Product chrome is One Dark (the pre-migration look). chevron-dark-* stays
 * bundled. Config copy is Chevron.
 * Does not change Windows userData name (PR 23b). Run:
 *   node --test script/ci/chevron-dark-themes.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('default themes', () => {
  it('core.themes default is one-dark-ui + one-dark-syntax', () => {
    const src = read('src/config-schema.js');
    assert.match(src, /default:\s*\['one-dark-ui',\s*'one-dark-syntax'\]/);
  });

  it('theme-manager fallback is one-dark', () => {
    const src = read('src/theme-manager.js');
    assert.match(
      src,
      /themeNames = \['one-dark-syntax', 'one-dark-ui'\]/
    );
    assert.match(src, /unshift\('one-dark-syntax'\)/);
    assert.match(src, /push\('one-dark-ui'\)/);
  });

  it('Package.getType returns chevron and activators match', () => {
    const pack = read('src/package.js');
    assert.match(pack, /getType\(\) \{\s*return 'chevron';/s);
    assert.doesNotMatch(pack, /return 'atom';/);
    const manager = read('src/package-manager.js');
    assert.match(
      manager,
      /registerPackageActivator\(this, \['chevron', 'textmate'\]\)/
    );
  });

  it('config-schema product copy says Chevron, not Atom', () => {
    const src = read('src/config-schema.js');
    assert.doesNotMatch(src, /when Atom starts/);
    assert.doesNotMatch(src, /outside Atom/);
    assert.doesNotMatch(src, /relaunch of Atom/);
    assert.doesNotMatch(src, /characters Atom will use/);
    assert.doesNotMatch(src, /whether Atom should use/);
    assert.doesNotMatch(src, /other than Atom/);
    assert.doesNotMatch(src, /Emulated with Atom events/);
    assert.doesNotMatch(src, /the atom on fullscreen/);
    assert.match(src, /when Chevron starts/);
    assert.match(src, /outside Chevron/);
    assert.match(src, /relaunch of Chevron/);
  });

  it('does not change the file-watcher enum value or atom:// protocol', () => {
    const src = read('src/config-schema.js');
    assert.match(src, /value: 'atom'/);
    assert.match(src, /atom:\/\//);
  });

  it('settings-view user-facing copy says Chevron', () => {
    const general = read('node_modules/settings-view/lib/general-panel.js');
    const updates = read('node_modules/settings-view/lib/updates-panel.js');
    const card = read('node_modules/settings-view/lib/package-card.js');
    const themes = read('node_modules/settings-view/lib/themes-panel.js');
    assert.match(general, /Chevron's core settings/);
    assert.doesNotMatch(general, /Atom's core settings/);
    assert.match(updates, /Restart Chevron/);
    assert.doesNotMatch(updates, /Restart Atom/);
    assert.match(card, /Restart Chevron/);
    assert.doesNotMatch(card, /Restart Atom/);
    assert.match(themes, /style Chevron/);
    assert.doesNotMatch(themes, /style Atom/);
  });
});
