'use strict';

/**
 * Settings can actually be constructed, and every command opens a real panel.
 *
 * settings-view.js is an esbuild bundle: it ends in
 * `module.exports = __toCommonJS(...)`, so require() yields
 * { __esModule: true, default: SettingsView } rather than the class. main.js
 * did `SettingsView = require('./settings-view')` and then `new SettingsView(...)`,
 * which threw
 *
 *   TypeError: SettingsView is not a constructor
 *
 * so no Settings panel could open at all -- not Themes, not Keybindings, not
 * Core. Nothing caught it: the build compiles the bundle happily, and the smoke
 * test only proves packages activate. It never opens a UI panel.
 *
 * Two classes of failure are checked here, both statically, so this runs
 * without Electron:
 *
 *   1. a `new X` on a require() of an esbuild bundle -- the interop bug
 *   2. a command opening chevron://config/<panel> where no panel exists --
 *      which is what the Install and Updates menu entries did after #239
 *      removed their panels
 *
 * Run: node --test script/ci/settings-view-openable.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'settings-view', 'lib');
const MAIN = path.join(LIB, 'main.js');

function isEsbuildBundle(file) {
  if (!fs.existsSync(file)) return false;
  return fs.readFileSync(file, 'utf8').includes('__toCommonJS');
}

// Panels registered in settings-view.js, by the name showPanel() matches. The
// URI suffix is the lowercased name.
function registeredPanels() {
  const src = fs.readFileSync(path.join(LIB, 'settings-view.js'), 'utf8');
  const names = [];
  for (const m of src.matchAll(/addCorePanel\(\s*"([^"]+)"/g)) {
    names.push(m[1].toLowerCase().replace(/\s+/g, '-'));
  }
  return names;
}

describe('settings-view is openable', () => {
  it('does not `new` the namespace object of an esbuild bundle', () => {
    const src = fs.readFileSync(MAIN, 'utf8');
    const offenders = [];
    // `X = require('./y')` followed anywhere by `new X(`
    for (const m of src.matchAll(
      /(\w+)\s*=\s*require\((['"])\.\/([\w-]+)\2\)/g
    )) {
      const [, binding, , target] = m;
      const file = path.join(LIB, `${target}.js`);
      if (!isEsbuildBundle(file)) continue;
      if (new RegExp(`new\\s+${binding}\\s*\\(`).test(src)) {
        offenders.push(
          `${binding} = require('./${target}') is an esbuild bundle exporting ` +
            `{ default }, but is used as \`new ${binding}(...)\``
        );
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'require() of an esbuild bundle yields a namespace object, not the ' +
        'class:\n  ' + offenders.join('\n  ')
    );
  });

  // Kept deliberately ahead of their panels: the Installer is the entry point
  // for the owned-package registry (docs/decisions/build-architecture.md), and
  // Updates goes with it. Opening either currently falls through to the Core
  // panel rather than erroring. Anything else in this position is a typo.
  const PLANNED_PANELS = new Set(['install', 'updates']);

  it('every settings-view command opens a panel that exists or is planned', () => {
    const src = fs.readFileSync(MAIN, 'utf8');
    const panels = registeredPanels();
    assert.ok(panels.length >= 5, 'expected the core panels to be registered');

    const missing = [];
    for (const m of src.matchAll(/CONFIG_URI\}\/([a-z-]+)/g)) {
      const target = m[1];
      if (!panels.includes(target) && !PLANNED_PANELS.has(target)) {
        missing.push(target);
      }
    }
    assert.deepEqual(
      [...new Set(missing)],
      [],
      'command opens chevron://config/<panel> with no such panel and no ' +
        'entry in PLANNED_PANELS; it silently shows Core instead:\n  ' +
        [...new Set(missing)].join('\n  ')
    );
  });

  it('the planned panels are still genuinely absent', () => {
    // If someone builds the Install panel, this fails and PLANNED_PANELS
    // should shrink -- otherwise the allowance outlives its reason.
    const panels = registeredPanels();
    const built = [...PLANNED_PANELS].filter(p => panels.includes(p));
    assert.deepEqual(
      built,
      [],
      'these panels now exist and should be removed from PLANNED_PANELS: ' +
        built.join(', ')
    );
  });

  it('every packageManager method the views call is defined', () => {
    // #239 removed the registry client and took normalizeVersion and
    // satisfiesVersion with it, but package-card.js still called both from
    // displayNotInstalledState. Rendering a card in that state threw
    // "this.packageManager.normalizeVersion is not a function", and the whole
    // Packages panel came up empty -- no card rendered, no error shown to the
    // user, just a blank list.
    //
    // Nothing caught it: the panel opens, the view constructs, and the throw
    // happens inside a render path. The bug is a caller outliving its method,
    // which is checkable without running anything.
    const managerSource = fs.readFileSync(
      path.join(LIB, 'package-manager.ts'),
      'utf8'
    );
    const defined = new Set(
      [...managerSource.matchAll(/^\s{2,6}([a-zA-Z][\w]*)\s*\(/gm)].map(m => m[1])
    );

    const called = new Map();
    for (const entry of fs.readdirSync(LIB)) {
      if (!/\.(js|ts)$/.test(entry) || entry.startsWith('package-manager')) continue;
      const src = fs.readFileSync(path.join(LIB, entry), 'utf8');
      for (const m of src.matchAll(/\bpackageManager\.([a-zA-Z][\w]*)\s*\(/g)) {
        if (!called.has(m[1])) called.set(m[1], entry);
      }
    }

    const missing = [...called.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, file]) => `${file} calls packageManager.${name}(), which no longer exists`);

    assert.deepEqual(
      missing,
      [],
      'a caller outlived its method; the panel renders empty rather than ' +
        'failing visibly:\n  ' + missing.join('\n  ')
    );
  });

  it('no menu entry dispatches a command that no longer exists', () => {
    const src = fs.readFileSync(MAIN, 'utf8');
    const declared = new Set(
      [...src.matchAll(/'(settings-view:[a-z-]+)'/g)].map(m => m[1])
    );
    const menuPath = path.join(
      ROOT,
      'packages',
      'settings-view',
      'menus',
      'settings-view.json'
    );
    const menu = JSON.parse(fs.readFileSync(menuPath, 'utf8'));

    const dangling = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      const command = node.command;
      if (
        typeof command === 'string' &&
        command.startsWith('settings-view:') &&
        !declared.has(command)
      ) {
        dangling.push(`${node.label || '(no label)'} -> ${command}`);
      }
      Object.values(node).forEach(walk);
    };
    walk(menu);

    assert.deepEqual(
      dangling,
      [],
      'menu entry dispatches a settings-view command main.js does not ' +
        'register:\n  ' + dangling.join('\n  ')
    );
  });
});
