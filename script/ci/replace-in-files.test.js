'use strict';

/**
 * Project replace uses JS RegExp, not rg --replace.
 * Run: node --test script/ci/replace-in-files.test.js
 */

const { describe, it, before, afterEach } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeTempDir } = require('../lib/temp-dir');
const {
  countMatches,
  replaceInFile,
  replaceInFiles
} = require('../../src/replace-in-files');

const SAMPLE = path.resolve(__dirname, '../../spec/fixtures/sample.js');

describe('countMatches', () => {
  it('counts global matches with JS semantics', () => {
    const text = fs.readFileSync(SAMPLE, 'utf8');
    assert.strictEqual(countMatches(text, /items/gi), 6);
    assert.strictEqual(countMatches(text, /;$/gim), 8);
  });

  it('counts a single match when the regex is not global', () => {
    assert.strictEqual(countMatches('aaa bbb aaa', /aaa/), 1);
  });
});

describe('replaceInFile / replaceInFiles', () => {
  let dir;

  before(() => {
    dir = makeTempDir('chevron-replace-');
  });

  afterEach(() => {
    for (const name of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  });

  it('emits replace:path-replaced with a JS replacement count', () => {
    const filePath = path.join(dir, 'sample.js');
    fs.copyFileSync(SAMPLE, filePath);
    const events = [];
    replaceInFiles([filePath], /items/gi, 'items', (name, payload) => {
      events.push({ name, payload });
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].name, 'replace:path-replaced');
    assert.strictEqual(events[0].payload.filePath, filePath);
    assert.strictEqual(events[0].payload.replacements, 6);
  });

  it('applies capture groups like String.prototype.replace', () => {
    const filePath = path.join(dir, 'groups.txt');
    fs.writeFileSync(filePath, 'hello world');
    const result = replaceInFile(filePath, /(hello) (world)/, '$2 $1');
    assert.strictEqual(result.replacements, 1);
    assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'world hello');
  });

  it('skips binary files', () => {
    const filePath = path.join(dir, 'blob.bin');
    fs.writeFileSync(filePath, Buffer.from([0x00, 0x61, 0x62, 0x63]));
    const result = replaceInFile(filePath, /a/g, 'z');
    assert.deepStrictEqual(result, { skipped: true });
  });

  it('emits replace:file-error with a path for a missing file', () => {
    const missing = path.join(dir, 'nope.js');
    const events = [];
    replaceInFiles([missing], /x/g, 'y', (name, payload) => {
      events.push({ name, payload });
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].name, 'replace:file-error');
    assert.strictEqual(events[0].payload.path, missing);
    assert.ok(events[0].payload.code);
  });

  it('does not write when there are no matches', () => {
    const filePath = path.join(dir, 'none.txt');
    fs.writeFileSync(filePath, 'zzz');
    const before = fs.statSync(filePath).mtimeMs;
    const result = replaceInFile(filePath, /aaa/g, 'bbb');
    assert.strictEqual(result.replacements, 0);
    assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'zzz');
    assert.strictEqual(fs.statSync(filePath).mtimeMs, before);
  });
});
