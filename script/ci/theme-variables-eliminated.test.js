'use strict';

/**
 * No package stylesheet needs a theme in scope any more.
 *
 * This is the invariant that lets prebuild-less-cache.js and the 16x UI x
 * syntax compile matrix go away: if no stylesheet outside a theme reads an
 * overridden theme variable, every stylesheet compiles once and a theme switch
 * is a stylesheet swap rather than a recompile.
 *
 * Two things are checked, because the converter cannot check either one itself.
 *
 * 1. No theme variable is left in the catalog.
 *
 *    The converter reports how many lines *it* would rewrite. That is not the
 *    same question: it skips variable definitions by design, so a file full of
 *
 *      @default-padding: @component-padding;
 *
 *    reported as clean while still pinning the whole compile to a theme. This
 *    asks the question the matrix actually depends on.
 *
 * 2. No LESS build-time function is handed a var().
 *
 *    contrast(), darken(), lightness() and friends need a real colour at build
 *    time. A var() reference is not one -- LESS either fails outright or emits
 *    something the browser drops in silence.
 *
 *    This class survives conversion, which is why it needs its own check: the
 *    converter's guard fires on seeing an unconverted @theme-variable on the
 *    line, so once a half-converted line reads
 *
 *      contrast(var(--syntax-background-color), ~"hsl(...)", ~"hsl(...)")
 *
 *    there is no @name left to notice and the converter calls the file clean
 *    forever. One of these did reach master that way.
 *
 * Run: node --test script/ci/theme-variables-eliminated.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function themeVariableNames() {
  const names = new Set();
  for (const file of ['ui-variables.less', 'syntax-variables.less']) {
    const src = fs.readFileSync(
      path.join(ROOT, 'static', 'variables', file),
      'utf8'
    );
    for (const m of src.matchAll(/^\s*@([a-zA-Z][a-zA-Z0-9-]*)\s*:/gm)) {
      names.add(m[1]);
    }
  }
  return names;
}

// A theme is identified by the `theme` field of its nearest enclosing
// package.json, walking up: `lsp-ui` ends in -ui and is an ordinary package,
// and one-dark-syntax keeps stylesheets in styles/syntax/, a directory below
// the manifest.
function nearestTheme(file) {
  let dir = path.dirname(file);
  while (dir.startsWith(path.join(ROOT, 'packages'))) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        return JSON.parse(fs.readFileSync(manifest, 'utf8')).theme || null;
      } catch (error) {
        return null;
      }
    }
    dir = path.dirname(dir);
  }
  return null;
}

function catalogStylesheets() {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      if (!entry.name.endsWith('.less')) continue;
      if (full.split(path.sep).includes('spec')) continue; // fixtures are the test
      if (nearestTheme(full)) continue;
      found.push(full);
    }
  };
  walk(path.join(ROOT, 'packages'));
  return found;
}

// LESS emits the contents of ~"..." verbatim and never evaluates them, so CSS
// written inside an escape is not a LESS call however much it looks like one.
// color-mix() is CSS and merely ends in `mix`.
function codeOutsideEscapes(line) {
  const commentAt = line.search(/(^|\s)\/\//);
  const code = commentAt === -1 ? line : line.slice(0, commentAt);
  return code.replace(/~"[^"]*"/g, m => ' '.repeat(m.length));
}

describe('theme variables are gone from the catalog', () => {
  const files = catalogStylesheets();

  it('finds the package stylesheets to check', () => {
    assert.ok(files.length > 50, `expected the catalog, got ${files.length}`);
  });

  it('no package stylesheet reads an overridden theme variable', () => {
    const vars = themeVariableNames();
    const offenders = [];
    for (const file of files) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const code = line.split(/(^|\s)\/\//)[0];
          for (const m of code.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)) {
            if (!vars.has(m[1])) continue;
            offenders.push(
              `${path.relative(ROOT, file)}:${i + 1}  ${line.trim()}`
            );
            return;
          }
        });
    }
    assert.deepEqual(
      offenders,
      [],
      'these still need a theme in scope at build time, which is what forces ' +
        'the per-theme compile matrix:\n  ' + offenders.join('\n  ')
    );
  });

  it('no LESS build-time function is handed a var()', () => {
    const FNS =
      /(^|[^-\w])(contrast|hsvvalue|hsvhue|hsvsaturation|luma|luminance|lightness|saturation|hue|red|green|blue|alpha|darken|lighten|fade|fadeout|fadein|mix|saturate|desaturate|tint|shade|spin|ceil|floor|round|percentage|unit)\s*\(/g;
    const offenders = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(full);
          continue;
        }
        if (!entry.name.endsWith('.less')) continue;
        fs.readFileSync(full, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            const code = codeOutsideEscapes(line);
            for (const m of code.matchAll(FNS)) {
              let k = m.index + m[0].length;
              let depth = 1;
              const start = k;
              while (k < code.length && depth > 0) {
                if (code[k] === '(') depth++;
                else if (code[k] === ')') depth--;
                k++;
              }
              if (code.slice(start, k - 1).includes('var(--')) {
                offenders.push(
                  `${path.relative(ROOT, full)}:${i + 1}  ${line.trim()}`
                );
              }
            }
          });
      }
    };
    walk(path.join(ROOT, 'packages'));
    walk(path.join(ROOT, 'static'));
    assert.deepEqual(
      offenders,
      [],
      'LESS needs a real value here and a custom property is not one; it ' +
        'fails the build or silently emits something the browser drops:\n  ' +
        offenders.join('\n  ')
    );
  });
});
