'use strict';

/**
 * Uninstall removed the package and then threw.
 *
 *   Uncaught TypeError: this.unload is not a function
 *     at exit (settings-view/index.js:4460)
 *
 * #239 removed the package registry and the install UI, and took
 * PackageManager#unload with it. `uninstall` still called it, so the cpm
 * process exited 0, the package left the disk, and the next line threw --
 * which skipped removePackageNameFromDisabledPackages, the callback, and the
 * 'uninstalled' event, so the card never updated.
 *
 * Nothing caught it because the call is inside a subprocess exit callback: it
 * only runs when a real uninstall finishes. These classes are plain objects
 * built by an IIFE, so a dropped method is not a load-time error either.
 *
 * This walks the call sites instead: every `this.foo(...)` in these classes
 * must resolve to a method the class defines.
 *
 * Run: node --test script/ci/settings-view-methods.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'settings-view', 'lib');

// package-manager.ts is `PackageManager = class ... {` inside an IIFE (methods
// at four spaces); atom-io-client.ts is a plain top-level class (two). Match on
// the shape of a method rather than on indentation, so neither is missed.
const SOURCES = ['package-manager.ts', 'atom-io-client.ts'];

// `if (...) {` and `for (...) {` look exactly like a method definition.
const NOT_A_METHOD = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'do', 'else', 'function', 'return'
]);

function methodsDefinedIn(source) {
  const defined = new Set();
  const definition = /^\s*(?:async\s+|static\s+|get\s+|set\s+)*(\w+)\s*\([^)]*\)\s*\{/gm;
  for (const match of source.matchAll(definition)) {
    if (!NOT_A_METHOD.has(match[1])) defined.add(match[1]);
  }
  return defined;
}

function methodsCalledIn(source) {
  const called = new Map();
  source.split('\n').forEach((line, index) => {
    // `this.foo(` only -- `this.emitter.emit(` is a call on a property, and
    // the property's own type is not this file's business.
    for (const match of line.matchAll(/this\.(\w+)\(/g)) {
      if (!called.has(match[1])) called.set(match[1], index + 1);
    }
  });
  return called;
}

describe('settings-view calls only methods it defines', () => {
  for (const file of SOURCES) {
    it(`${file} has no call to a missing method`, () => {
      const source = fs.readFileSync(path.join(LIB, file), 'utf8');
      const defined = methodsDefinedIn(source);
      assert.ok(defined.size > 3, `parsed no methods out of ${file}`);

      const offenders = [];
      for (const [name, line] of methodsCalledIn(source)) {
        if (!defined.has(name)) offenders.push(`${file}:${line}  this.${name}()`);
      }
      assert.deepEqual(
        offenders,
        [],
        'these throw when the line is reached, which for a subprocess exit ' +
          'callback is only in front of a user:\n  ' + offenders.join('\n  ')
      );
    });
  }

  it('uninstall can unload the package it removed', () => {
    const source = fs.readFileSync(path.join(LIB, 'package-manager.ts'), 'utf8');
    assert.match(
      source,
      /unload\(name\)\s*\{[\s\S]*?chevron\.packages\.unloadPackage\(name\)/,
      'uninstall calls this.unload after cpm exits 0; without it the package ' +
        'is gone from disk but still loaded, and the card never updates'
    );
  });
});
