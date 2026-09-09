'use strict';

/**
 * Following the OS appearance swaps a theme for its counterpart, and only
 * when that counterpart is installed.
 *
 * Run: node --test script/ci/theme-variants.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
// A src/ module is TypeScript (src-typescript-first.test.js); Node 24 strips
// the types itself, so the test needs neither the compile-cache nor tsc.
const {
  counterpart,
  appearanceOf,
  themeVariantForAppearance,
  themeNamesForAppearance
} = require(path.join(ROOT, 'src', 'theme-variants.ts'));

const SHIPPED = new Set([
  'one-dark-ui',
  'one-dark-syntax',
  'one-light-ui',
  'one-light-syntax',
  'chevron-dark-ui',
  'chevron-dark-syntax',
  'chevron-light-ui',
  'chevron-light-syntax'
]);
const exists = name => SHIPPED.has(name);

describe('counterpart', () => {
  it('swaps the one word that differs between a pair', () => {
    assert.equal(counterpart('one-dark-ui'), 'one-light-ui');
    assert.equal(counterpart('chevron-light-syntax'), 'chevron-dark-syntax');
    assert.equal(counterpart('dark-theme'), 'light-theme');
    assert.equal(counterpart('solarized-dark'), 'solarized-light');
  });

  it('has none for a theme that names no appearance', () => {
    assert.equal(counterpart('monokai'), null);
    assert.equal(
      counterpart('darkula-ui'),
      null,
      'a word that merely contains dark'
    );
    assert.equal(counterpart(undefined), null);
  });

  it('reads the appearance the same way', () => {
    assert.equal(appearanceOf('one-dark-ui'), 'dark');
    assert.equal(appearanceOf('one-light-ui'), 'light');
    assert.equal(appearanceOf('monokai'), null);
  });
});

describe('themeVariantForAppearance', () => {
  it('keeps a theme that already matches', () => {
    assert.equal(
      themeVariantForAppearance('one-dark-ui', { dark: true, exists }),
      'one-dark-ui'
    );
    assert.equal(
      themeVariantForAppearance('one-light-ui', { dark: false, exists }),
      'one-light-ui'
    );
  });

  it('swaps to the counterpart when it is installed', () => {
    assert.equal(
      themeVariantForAppearance('one-dark-ui', { dark: false, exists }),
      'one-light-ui'
    );
    assert.equal(
      themeVariantForAppearance('chevron-light-syntax', { dark: true, exists }),
      'chevron-dark-syntax'
    );
  });

  it('leaves a theme alone when its counterpart is not installed', () => {
    assert.equal(
      themeVariantForAppearance('solarized-dark', { dark: false, exists }),
      'solarized-dark'
    );
    assert.equal(
      themeVariantForAppearance('monokai', { dark: true, exists }),
      'monokai'
    );
  });

  it('maps a whole core.themes list, preserving order', () => {
    assert.deepEqual(
      themeNamesForAppearance(['one-dark-ui', 'one-dark-syntax'], {
        dark: false,
        exists
      }),
      ['one-light-ui', 'one-light-syntax']
    );
    assert.deepEqual(
      themeNamesForAppearance(undefined, { dark: true, exists }),
      []
    );
  });
});
