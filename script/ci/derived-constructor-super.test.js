'use strict';

/**
 * A derived constructor may not touch `this` before calling `super()`.
 *
 * CoffeeScript let a subclass constructor assign its fields first and call
 * the parent afterwards, and decaffeinate carried that shape over unchanged —
 * its own header in these files says "DS002: Fix invalid constructor". As a
 * real ES6 class it is a hard error at construction time:
 *
 *   Must call super constructor in derived class before accessing 'this'
 *
 * It cost the tree-view every one of its file operations. Add file, add
 * folder, rename and duplicate each threw the moment the dialog was built,
 * and nothing noticed because nothing constructed them outside a running
 * editor. A grep is a poor substitute for running the code, but it is the
 * cheap half, and it covers every class in the repo rather than the three
 * that were found by hand.
 *
 * Run: node --test script/ci/derived-constructor-super.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeTempDir, removeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const SEARCH_ROOTS = ['src', 'packages'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'spec', 'test', 'benchmarks']);

function sourceFiles() {
  const found = [];
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|ts)$/.test(entry.name)) found.push(full);
    }
  };
  for (const root of SEARCH_ROOTS) walk(path.join(ROOT, root));
  return found;
}

/**
 * Comments and string literals blanked out, so `this` in prose and "super("
 * in a message are not mistaken for code. Length is preserved so offsets
 * still line up with the original.
 */
function withoutCommentsAndStrings(source) {
  const chars = source.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < chars.length; k++) {
      if (chars[k] !== '\n') chars[k] = ' ';
    }
  };

  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') j += 2;
        else if (source[j] === quote) { j++; break; }
        else j++;
      }
      blank(i, j);
      i = j;
    } else {
      i++;
    }
  }
  return chars.join('');
}

function offenders(file) {
  const source = fs.readFileSync(file, 'utf8');
  if (!/extends\s+[\w$.]/.test(source)) return [];
  const code = withoutCommentsAndStrings(source);
  const found = [];
  const constructorPattern = /\bconstructor\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = constructorPattern.exec(code))) {
    const bodyStart = constructorPattern.lastIndex;
    let i = bodyStart;
    let depth = 1;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }
    const body = code.slice(bodyStart, i - 1);
    const superAt = body.search(/\bsuper\s*\(/);
    // No super() at all: either a base class, or a derived one that is
    // already broken in a way the runtime reports plainly.
    if (superAt === -1) continue;
    const before = body.slice(0, superAt);
    if (!/\bthis\b/.test(before)) continue;
    const line = code.slice(0, bodyStart).split('\n').length;
    const offending = source
      .slice(bodyStart, bodyStart + superAt)
      .split('\n')
      .map(l => l.trim())
      .find(l => /\bthis\b/.test(l));
    found.push(`${path.relative(ROOT, file)}:${line} — ${offending}`);
  }
  return found;
}

test('no derived constructor touches this before super()', () => {
  const found = [];
  for (const file of sourceFiles()) found.push(...offenders(file));
  assert.deepEqual(
    found,
    [],
    'These constructors throw "Must call super constructor" the moment they ' +
      'are built. Work the super() arguments out in locals, call super(), ' +
      'then assign the fields:\n' +
      found.join('\n')
  );
});

test('the scan can tell code from prose', () => {
  // The first version of this gate flagged its own explanatory comment.
  const decoy = `
    class A extends B {
      constructor(x) {
        // this is set after super, honestly
        /* and this too */
        const message = 'this before super';
        super({ x });
        this.x = x;
      }
    }
  `;
  const dir = makeTempDir('ctor-scan-');
  const file = path.join(dir, 'decoy.js');
  fs.writeFileSync(file, decoy);
  try {
    assert.deepEqual(offenders(file), []);
  } finally {
    removeTempDir(dir);
  }
});

test('and still catches the real shape', () => {
  const broken = `
    class A extends B {
      constructor(x) {
        this.x = x;
        super({ x });
      }
    }
  `;
  const dir = makeTempDir('ctor-scan-');
  const file = path.join(dir, 'broken.js');
  fs.writeFileSync(file, broken);
  try {
    const found = offenders(file);
    assert.equal(found.length, 1);
    assert.match(found[0], /this\.x = x;/);
  } finally {
    removeTempDir(dir);
  }
});
