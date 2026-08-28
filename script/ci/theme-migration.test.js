'use strict';

/**
 * Themes that no longer ship must map onto ones that do.
 *
 * A missing theme is not auto-corrected: warnForNonExistentThemes() only logs,
 * and the generic fallback in getEnabledThemeNames() pairs whatever survives
 * with one-dark-*. So a config of ['one-light-ui', 'solarized-light-syntax']
 * would end up a light UI with dark syntax. THEME_RENAMES is what keeps an
 * existing user on an equivalent theme.
 *
 * Run: node --test script/ci/theme-migration.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'src', 'theme-manager.js'), 'utf8');

function renameMap() {
  const start = src.indexOf('const THEME_RENAMES = {');
  assert.ok(start !== -1, 'THEME_RENAMES not found');
  const body = src.slice(start, src.indexOf('};', start));
  const map = {};
  for (const m of body.matchAll(/'([^']+)':\s*'([^']+)'/g)) map[m[1]] = m[2];
  return map;
}

function shipped(name) {
  return fs.existsSync(path.join(ROOT, 'packages', name, 'package.json'));
}

describe('theme migration', () => {
  const map = renameMap();

  it('maps every removed and renamed theme', () => {
    for (const removed of [
      'atom-dark-syntax',
      'atom-dark-ui',
      'atom-light-syntax',
      'atom-light-ui',
      'solarized-dark-syntax',
      'solarized-light-syntax',
      'base16-tomorrow-dark-theme',
      'base16-tomorrow-light-theme'
    ]) {
      assert.ok(map[removed], `${removed} has no replacement`);
    }
  });

  it('every mapping target actually ships', () => {
    for (const [from, to] of Object.entries(map)) {
      assert.ok(
        shipped(to),
        `${from} maps to ${to}, which is not in packages/`
      );
      assert.ok(
        !shipped(from),
        `${from} still ships — it should not be mapped`
      );
    }
  });

  it('keeps light on light and dark on dark', () => {
    for (const [from, to] of Object.entries(map)) {
      if (/light/.test(from)) {
        assert.match(
          to,
          /light/,
          `${from} -> ${to} sends a light theme to dark`
        );
      }
      if (/dark/.test(from)) {
        assert.match(
          to,
          /dark/,
          `${from} -> ${to} sends a dark theme to light`
        );
      }
    }
  });

  it('the built-in fallback list only names themes that ship', () => {
    const start = src.indexOf('const builtInThemeNames = [');
    assert.ok(start !== -1, 'builtInThemeNames not found');
    const body = src.slice(start, src.indexOf('];', start));
    const names = [...body.matchAll(/'([^']+)'/g)].map(m => m[1]);
    assert.ok(names.length >= 4, `only ${names.length} built-ins listed`);
    for (const n of names) {
      assert.ok(
        shipped(n),
        `builtInThemeNames lists ${n}, which is not in packages/`
      );
    }
  });

  it('the configured default ships', () => {
    const schema = fs.readFileSync(
      path.join(ROOT, 'src', 'config-schema.js'),
      'utf8'
    );
    const m = schema.match(/default:\s*\[('one-[^\]]+)\]/);
    assert.ok(m, 'could not read the default theme pair');
    for (const name of [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])) {
      assert.ok(shipped(name), `default theme ${name} is not in packages/`);
    }
  });
});
