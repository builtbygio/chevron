'use strict';

/**
 * The keymap engine, vendored from the atom-keymap fork to drop season,
 * fs-plus and two mismatched dependency ranges. Resolution logic is adopted
 * unchanged; only the dependencies underneath differ.
 *
 * These assertions cover the one genuinely new piece: duplicate key detection,
 * which season provided via allowDuplicateKeys:false and JSON.parse does not.
 *
 * Run: node --test script/ci/keymap-vendored.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const { findDuplicateKey, readKeymapFile } = require(
  path.join(ROOT, 'src', 'keymap', 'read-keymap-file.ts')
);

describe('vendored keymap reader', () => {
  it('accepts a keymap with no duplicates', () => {
    assert.equal(findDuplicateKey('{"atom-text-editor":{"ctrl-s":"core:save"}}'), null);
  });

  it('finds a duplicate key at the top level', () => {
    assert.equal(findDuplicateKey('{"a":1,"a":2}'), 'a');
  });

  it('finds a duplicate nested inside an object', () => {
    assert.equal(findDuplicateKey('{"x":{"k":1,"k":2}}'), 'k');
  });

  it('allows the same key in two different objects', () => {
    // Two selectors binding the same keystroke is normal and must not error.
    assert.equal(findDuplicateKey('{"x":{"k":1},"y":{"k":2}}'), null);
  });

  it('is not confused by array members', () => {
    assert.equal(findDuplicateKey('{"a":[{"z":1},{"z":2}]}'), null);
  });

  it('is not confused by a value that equals a key', () => {
    assert.equal(findDuplicateKey('{"a":"a"}'), null);
  });

  it('throws on a duplicate, naming the key and the file', () => {
    const dir = makeTempDir('chevron-keymap-');
    const file = path.join(dir, 'keymap.json');
    fs.writeFileSync(file, '{"atom-workspace":{"ctrl-x":"a","ctrl-x":"b"}}');
    assert.throws(() => readKeymapFile(file), /ctrl-x/);
    assert.throws(() => readKeymapFile(file), /keymap\.json/);
  });

  it('reads a valid keymap', () => {
    const dir = makeTempDir('chevron-keymap-');
    const file = path.join(dir, 'keymap.json');
    fs.writeFileSync(file, '{"atom-text-editor":{"ctrl-s":"core:save"}}');
    assert.deepEqual(readKeymapFile(file), {
      'atom-text-editor': { 'ctrl-s': 'core:save' }
    });
  });

  it('treats an empty file as an empty keymap', () => {
    const dir = makeTempDir('chevron-keymap-');
    const file = path.join(dir, 'keymap.json');
    fs.writeFileSync(file, '\n  \n');
    assert.deepEqual(readKeymapFile(file), {});
  });
});

describe('the atom-keymap package is gone', () => {
  it('is not a dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.ok(
      !(pkg.dependencies || {})['atom-keymap'],
      'the fork was vendored into src/keymap/'
    );
  });

  it('core requires the vendored manager', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'keymap-extensions.ts'), 'utf8');
    assert.match(src, /require\('\.\/keymap\/keymap-manager'\)/);
    assert.doesNotMatch(src, /require\('atom-keymap'\)/);
  });

  it('the keymap path no longer pulls season, fs-plus or pathwatcher', () => {
    // These stay in the tree for other consumers, but nothing on the keymap
    // path needs them: CSON is not read, and one watched file does not
    // justify a native watcher.
    for (const file of fs.readdirSync(path.join(ROOT, 'src', 'keymap'))) {
      if (!file.endsWith('.ts')) continue;
      const source = fs
        .readFileSync(path.join(ROOT, 'src', 'keymap', file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*(\/\/|\*).*$/gm, '');
      for (const dep of ['season', 'fs-plus', 'pathwatcher']) {
        assert.doesNotMatch(
          source,
          new RegExp(`require\\('${dep}'\\)`),
          `src/keymap/${file} must not require ${dep}`
        );
      }
    }
  });
});
