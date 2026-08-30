'use strict';

/**
 * Rewrite theme-variable references in package stylesheets to CSS custom
 * properties.
 *
 * Only the 85 variables that themes actually override become custom
 * properties. Everything else in static/variables (the 242 octicon codes, the
 * mixins) stays a build-time LESS variable, and package-local variables like
 * about's `@atom-green` are left alone -- converting those would be wrong.
 *
 * Handled:
 *   @text-color                 -> var(--text-color)
 *   darken(@c, 10%)             -> hsl(from var(--c) h s calc(l - 10))
 *   lighten(@c, 10%)            -> hsl(from var(--c) h s calc(l + 10))
 *   fade(@c, 50%)               -> rgb(from var(--c) r g b / 50%)
 *   fadeout(@c, 20%)            -> rgb(from var(--c) r g b / calc(alpha - 0.2))
 *   fadein(@c, 20%)             -> rgb(from var(--c) r g b / calc(alpha + 0.2))
 *
 * Deliberately NOT handled -- reported instead:
 *   arithmetic (`@font-size + 1`). LESS infers the unit from the left operand,
 *   so `12px + 1` is 13px. `calc(var(--font-size) + 1)` is invalid CSS: the
 *   unit has to be written out. Guessing it would silently produce a
 *   stylesheet that drops the declaration.
 *
 * `l` in relative color syntax resolves to a number, not a percentage, so the
 * replacement is calc(l - 10) and not calc(l - 10%) -- the latter does not
 * parse (verified in Electron 43 / Chrome 150).
 *
 * Usage:
 *   node script/lib/less-to-custom-properties.js --check  [paths...]
 *   node script/lib/less-to-custom-properties.js --write  [paths...]
 */

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

// A theme variable only counts if some theme redefines it; the rest are
// constants and must stay LESS variables.
function overriddenNames(base) {
  const themes = fs
    .readdirSync(path.join(ROOT, 'packages'))
    .filter(d => /-(ui|syntax)$/.test(d));
  const overridden = new Set();
  for (const theme of themes) {
    const dir = path.join(ROOT, 'packages', theme, 'styles');
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.less')) continue;
      const src = fs.readFileSync(path.join(dir, entry), 'utf8');
      for (const m of src.matchAll(/^\s*@([a-zA-Z][a-zA-Z0-9-]*)\s*:/gm)) {
        if (base.has(m[1])) overridden.add(m[1]);
      }
    }
  }
  return overridden;
}

// LESS defines its own hsl()/rgb(), so it tries to parse these as calls and
// fails with "Could not parse call arguments". `~"..."` is LESS's escape: the
// contents are emitted verbatim. This goes away with LESS itself in step 2.
const esc = css => `~"${css}"`;

const COLOR_FNS = {
  darken: (v, n) => esc(`hsl(from var(--${v}) h s calc(l - ${n}))`),
  lighten: (v, n) => esc(`hsl(from var(--${v}) h s calc(l + ${n}))`),
  fade: (v, n) => esc(`rgb(from var(--${v}) r g b / ${n}%)`),
  fadeout: (v, n) => esc(`rgb(from var(--${v}) r g b / calc(alpha - ${n / 100}))`),
  fadein: (v, n) => esc(`rgb(from var(--${v}) r g b / calc(alpha + ${n / 100}))`)
};

function convert(source, vars) {
  const unhandled = [];
  const lines = source.split('\n');

  const out = lines.map((line, i) => {
    // Never rewrite the variable definitions themselves, or imports.
    if (/^\s*@[a-zA-Z][a-zA-Z0-9-]*\s*:/.test(line)) return line;
    if (/^\s*@import\b/.test(line)) return line;

    let result = line;

    // 1. colour functions wrapping a theme variable
    result = result.replace(
      /\b(darken|lighten|fade|fadeout|fadein)\(\s*@([a-zA-Z][a-zA-Z0-9-]*)\s*,\s*([0-9.]+)%\s*\)/g,
      (whole, fn, name, pct) =>
        vars.has(name) ? COLOR_FNS[fn](name, Number(pct)) : whole
    );

    // 2. arithmetic on a theme variable -- report, do not touch
    for (const m of result.matchAll(
      /@([a-zA-Z][a-zA-Z0-9-]*)\s*[*/+-]\s*[0-9@.]/g
    )) {
      if (vars.has(m[1])) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'arithmetic' });
      }
    }

    // 3. plain references (skip any left inside an arithmetic expression)
    result = result.replace(
      /@([a-zA-Z][a-zA-Z0-9-]*)/g,
      (whole, name, offset) => {
        if (!vars.has(name)) return whole;
        const after = result.slice(offset + whole.length);
        const before = result.slice(0, offset);
        if (/^\s*[*/+-]\s*[0-9@.]/.test(after)) return whole;
        if (/[0-9)]\s*[*/+-]\s*$/.test(before)) return whole;
        return `var(--${name})`;
      }
    );

    return result;
  });

  return { output: out.join('\n'), unhandled };
}

function lessFilesUnder(target) {
  const found = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(p);
      } else if (entry.name.endsWith('.less')) {
        found.push(p);
      }
    }
  };
  const stat = fs.statSync(target);
  if (stat.isDirectory()) walk(target);
  else found.push(target);
  return found;
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const targets = args.filter(a => !a.startsWith('--'));
  if (targets.length === 0) {
    console.error('usage: less-to-custom-properties.js --check|--write <paths...>');
    process.exit(2);
  }

  const vars = overriddenNames(themeVariableNames());
  let changed = 0;
  let scanned = 0;
  const allUnhandled = [];

  for (const target of targets) {
    for (const file of lessFilesUnder(target)) {
      // A theme's own variable files define the values; never rewrite them.
      if (/packages\/[^/]+-(ui|syntax)\/styles\//.test(file)) continue;
      scanned++;
      const src = fs.readFileSync(file, 'utf8');
      const { output, unhandled } = convert(src, vars);
      for (const u of unhandled) {
        allUnhandled.push({ file: path.relative(ROOT, file), ...u });
      }
      if (output !== src) {
        changed++;
        if (write) fs.writeFileSync(file, output);
      }
    }
  }

  console.log(
    `${write ? 'rewrote' : 'would rewrite'} ${changed} of ${scanned} stylesheets ` +
      `(${vars.size} theme variables)`
  );
  if (allUnhandled.length) {
    console.log(`\n${allUnhandled.length} expressions need manual conversion:`);
    for (const u of allUnhandled.slice(0, 40)) {
      console.log(`  ${u.file}:${u.line}  ${u.text}`);
    }
    if (allUnhandled.length > 40) {
      console.log(`  … and ${allUnhandled.length - 40} more`);
    }
  }
}

main();
