'use strict';

/**
 * Two ways the LESS-to-custom-properties conversion went wrong silently.
 *
 * 1. A hyphenated variable name split into arithmetic.
 *
 *    The rewrite matched /@([a-zA-Z][a-zA-Z0-9-]*)\s*([*\/+-])\s*(...)/, and a
 *    name may contain '-' while '-' is also an operator. Given
 *    `@text-color-subtle` there is no operator after the full name, so the
 *    engine backtracked to name `text-color`, operator `-`, operand `subtle`
 *    and emitted
 *
 *      color: calc(var(--text-color) - subtle);
 *
 *    which is not a colour. The browser drops the declaration and the text
 *    falls back to whatever it inherits. 209 declarations across 46
 *    stylesheets were in that state.
 *
 * 2. static/ was never converted.
 *
 *    The elimination test walks packages/ for leftover theme variables but
 *    only walks static/ for the build-time-function check. So
 *    static/scaffolding.less kept `html { color: @text-color }` and
 *    static/core-ui/workspace-view.less kept `atom-workspace { color:
 *    @text-color }`. Both compile once, against the base variables, which are
 *    the light defaults -- so the document and the workspace were pinned to
 *    #333 text on every theme, and anything that did not set its own colour
 *    inherited it.
 *
 * Run: node --test script/ci/theme-variable-conversion.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// A var() reference minus a bare word is never valid CSS.
const SPLIT_NAME = /calc\(\s*var\(--[a-z-]+\)\s*[-+*/]\s*[a-z][a-z-]*\s*\)/;

function lessFiles(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    return acc;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'spec') continue;
      lessFiles(full, acc);
    } else if (entry.name.endsWith('.less') || entry.name.endsWith('.css')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('no hyphenated name was split into arithmetic', () => {
  it('nothing subtracts a word from a custom property', () => {
    const offenders = [];
    for (const dir of [path.join(ROOT, 'packages'), path.join(ROOT, 'static')]) {
      for (const file of lessFiles(dir)) {
        const source = fs.readFileSync(file, 'utf8');
        source.split('\n').forEach((line, i) => {
          if (SPLIT_NAME.test(line)) {
            offenders.push(`${path.relative(ROOT, file)}:${i + 1}  ${line.trim()}`);
          }
        });
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'calc(var(--x) - word) is not a value; the browser drops it and the ' +
        'property falls back to whatever it inherits:\n  ' + offenders.join('\n  ')
    );
  });

  it('the converter needs spaces around a minus', () => {
    // LESS reads @a-b as one identifier; subtraction is written with spaces.
    const src = fs.readFileSync(
      path.join(ROOT, 'script', 'lib', 'less-to-custom-properties.js'),
      'utf8'
    );
    assert.match(
      src,
      /@\(\[a-zA-Z\]\[a-zA-Z0-9-\]\*\)\\s\+\(-\)\\s\+/,
      'the minus pattern must require whitespace, or a hyphenated name splits'
    );
    assert.ok(
      !/\[\*\\\/\+-\]/.test(src),
      'a single [*/+-] class lets the engine backtrack into the name'
    );
  });
});

describe('the document and workspace take their colour from the theme', () => {
  // These two set the colour everything else inherits, so a build-time value
  // here overrides the active theme for every element that does not set its
  // own.
  const INHERITED_ROOTS = [
    path.join('static', 'scaffolding.less'),
    path.join('static', 'core-ui', 'workspace-view.less')
  ];

  for (const relative of INHERITED_ROOTS) {
    it(`${relative} reads custom properties, not LESS variables`, () => {
      const source = fs.readFileSync(path.join(ROOT, relative), 'utf8');
      const offenders = source
        .split('\n')
        .filter(line => /^\s*(color|background-color)\s*:\s*@[a-z]/.test(line))
        .map(line => line.trim());
      assert.deepEqual(
        offenders,
        [],
        `${relative} compiles once against the base variables, which are the ` +
          'light defaults; a colour set here ignores the active theme:\n  ' +
          offenders.join('\n  ')
      );
    });
  }
});
