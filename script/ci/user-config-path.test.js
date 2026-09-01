'use strict';

/**
 * User config, keymap and snippets are JSON. CSON is not read.
 *
 * CSON reading existed to carry users over from Atom, and it cost the product
 * a second language's compiler: season -> cson-parser -> coffee-script,
 * 0.38 MB shipped so a file most users no longer have could be parsed once.
 *
 * A real Atom config.cson is not valid JSON -- unquoted keys, indentation
 * rather than braces -- so a user with one gets defaults. That is the point of
 * strandedCsonFiles: the file is reported and left alone, never read and never
 * deleted, because silently starting on defaults while the user's settings sit
 * on disk is the worst available behaviour.
 *
 * Run: node --test script/ci/user-config-path.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');
const {
  resolveUserDataFile,
  strandedCsonFiles,
  readObjectFile,
  writeJsonFile
} = require('../../src/user-config-path');

let tmp;
before(() => {
  tmp = makeTempDir('chevron-userconfig-');
});
after(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (error) {}
});

function home(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

describe('user data files are JSON', () => {
  it('resolves the .json path even when only .cson exists', () => {
    const dir = home('cson-only');
    fs.writeFileSync(path.join(dir, 'config.cson'), '"*":\n  core:\n    x: 1\n');
    const resolved = resolveUserDataFile(dir, 'config');
    assert.equal(resolved.filePath, path.join(dir, 'config.json'));
    assert.equal(resolved.format, 'json');
  });

  it('reports a .cson that nothing will read', () => {
    const dir = home('stranded');
    fs.writeFileSync(path.join(dir, 'config.cson'), '"*":\n  core:\n    x: 1\n');
    fs.writeFileSync(path.join(dir, 'keymap.cson'), "'body':\n  'ctrl-x': 'y'\n");
    const stranded = strandedCsonFiles(dir).map(f => path.basename(f)).sort();
    assert.deepEqual(stranded, ['config.cson', 'keymap.cson']);
  });

  it('does not report a .cson once the .json beside it exists', () => {
    const dir = home('both');
    fs.writeFileSync(path.join(dir, 'config.cson'), '"*":\n  core:\n    x: 1\n');
    writeJsonFile(path.join(dir, 'config.json'), { '*': { core: { x: 1 } } });
    assert.deepEqual(strandedCsonFiles(dir), []);
  });

  it('never deletes a .cson', () => {
    const dir = home('kept');
    const cson = path.join(dir, 'config.cson');
    fs.writeFileSync(cson, '"*":\n  core:\n    x: 1\n');
    resolveUserDataFile(dir, 'config');
    strandedCsonFiles(dir);
    assert.ok(fs.existsSync(cson), 'the user file must survive untouched');
  });

  it('reads and writes JSON', () => {
    const dir = home('roundtrip');
    const file = path.join(dir, 'config.json');
    writeJsonFile(file, { a: { b: 2 } });
    assert.deepEqual(readObjectFile(file), { a: { b: 2 } });
  });

  it('treats an empty file as an empty object', () => {
    const dir = home('empty');
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '   \n');
    assert.deepEqual(readObjectFile(file), {});
  });

  it('does not fall back to a CSON parser on invalid JSON', () => {
    // The fallback is what pulled coffee-script into the product. Invalid
    // JSON must now throw rather than quietly reaching for another parser.
    const dir = home('invalid');
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, '"*":\n  core:\n    x: 1\n');
    assert.throws(() => readObjectFile(file), /JSON/);
  });
});
