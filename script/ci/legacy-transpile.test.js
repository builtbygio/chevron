'use strict';

/**
 * CHEVRON_DISABLE_LEGACY_TRANSPILE behaviour for babel/coffee compilers.
 * Run: node --test script/ci/legacy-transpile.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

describe('legacy transpile isolation', () => {
  let prev;

  before(() => {
    prev = process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
  });

  after(() => {
    if (prev === undefined) delete process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
    else process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE = prev;
    // Compilers cache module state; re-require fresh by clearing cache.
    delete require.cache[require.resolve(path.join(ROOT, 'src/babel.js'))];
    delete require.cache[require.resolve(path.join(ROOT, 'src/coffee-script.js'))];
  });

  it('refuses coffee and babel when CHEVRON_DISABLE_LEGACY_TRANSPILE=1', () => {
    process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE = '1';
    delete require.cache[require.resolve(path.join(ROOT, 'src/babel.js'))];
    delete require.cache[require.resolve(path.join(ROOT, 'src/coffee-script.js'))];
    const babel = require(path.join(ROOT, 'src/babel.js'));
    const coffee = require(path.join(ROOT, 'src/coffee-script.js'));

    assert.strictEqual(coffee.shouldCompile(), false);
    assert.strictEqual(
      babel.shouldCompile('/** @babel */\nconst x = 1;'),
      false
    );
    assert.throws(
      () => coffee.compile('x = 1', '/tmp/x.coffee'),
      /CHEVRON_DISABLE_LEGACY_TRANSPILE/
    );
    assert.throws(
      () => babel.compile('/** @babel */\nconst x = 1;', '/tmp/x.js'),
      /CHEVRON_DISABLE_LEGACY_TRANSPILE/
    );
  });

  it('detects babel prefixes when legacy transpile env is off', () => {
    delete process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
    delete require.cache[require.resolve(path.join(ROOT, 'src/babel.js'))];
    delete require.cache[require.resolve(path.join(ROOT, 'src/coffee-script.js'))];
    const babel = require(path.join(ROOT, 'src/babel.js'));
    const coffee = require(path.join(ROOT, 'src/coffee-script.js'));

    assert.strictEqual(coffee.shouldCompile(), true);
    assert.strictEqual(
      babel.shouldCompile('/** @babel */\nconst x = 1;'),
      true
    );
    assert.strictEqual(babel.shouldCompile('const x = 1;'), false);
  });

  it('refuses coffee compile after coffee-script dependency removal (Option 2)', () => {
    delete process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
    delete require.cache[require.resolve(path.join(ROOT, 'src/coffee-script.js'))];
    const coffee = require(path.join(ROOT, 'src/coffee-script.js'));

    assert.strictEqual(coffee.shouldCompile(), true);
    assert.throws(
      () => coffee.compile('x = 1', '/tmp/x.coffee'),
      /issue #62|CoffeeScript runtime transpile was removed/
    );
  });

  it('refuses babel compile after babel-core dependency removal (Option 3)', () => {
    delete process.env.CHEVRON_DISABLE_LEGACY_TRANSPILE;
    delete require.cache[require.resolve(path.join(ROOT, 'src/babel.js'))];
    const babel = require(path.join(ROOT, 'src/babel.js'));

    assert.strictEqual(
      babel.shouldCompile('/** @babel */\nconst x = 1;'),
      true
    );
    assert.throws(
      () => babel.compile('/** @babel */\nconst x = 1;', '/tmp/x.js'),
      /issue #62|Babel runtime transpile was removed/
    );
  });
});
