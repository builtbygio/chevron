'use strict';

/**
 * Rewrite theme-variable references in package stylesheets to CSS custom
 * properties. Arithmetic is reported, never converted.
 *
 * See docs/reference/theme-custom-properties.md for the conversion table and
 * the reasons.
 *
 * Usage: node script/lib/less-to-custom-properties.js --check|--write [paths]
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

// A local defined from a theme variable keeps the theme in scope even after
// every use site converts. Rewriting the definition to an escaped string --
// `@default-padding: ~"var(--component-padding)"` -- moves the dependency out
// without touching use sites, but only holds while the local is used as a
// plain value: LESS cannot do arithmetic on a string or pass one to darken().
// Use sites are checked first; anything else is left alone and reported.
function localUsedUnsafely(lines, name, defLine) {
  const use = new RegExp(`@${name}\\b`);
  const reasons = [];
  lines.forEach((line, i) => {
    if (i === defLine) return;
    const commentAt = line.search(/(^|\s)\/\//);
    const code = commentAt === -1 ? line : line.slice(0, commentAt);
    if (!use.test(code)) return;

    if (/\bwhen\s*\(/.test(code)) {
      reasons.push(`used in a LESS guard (line ${i + 1})`);
      return;
    }
    // Inside a LESS function -- darken(@local, 5%). calc() and var() are CSS
    // and resolve in the browser, so a string is fine there.
    const inFn = new RegExp(
      `\\b(?!calc\\b|var\\b)[a-zA-Z][-\\w]*\\(\\s*[^()]*@${name}\\b`
    );
    if (inFn.test(code)) {
      reasons.push(`passed to a LESS function (line ${i + 1})`);
      return;
    }
    // Build-time arithmetic. Inside a ~"..." escape the maths is CSS calc and
    // already resolves in the browser, so only look at the unescaped parts.
    const bare = code.replace(/~"[^"]*"/g, '');
    if (
      new RegExp(`@${name}\\s*[*/+]`).test(bare) ||
      new RegExp(`[*/+]\\s*@${name}\\b`).test(bare) ||
      new RegExp(`@${name}\\s+-\\s+`).test(bare) ||
      new RegExp(`\\S\\s+-\\s*@${name}\\b`).test(bare)
    ) {
      reasons.push(`an arithmetic operand (line ${i + 1})`);
    }
  });
  return reasons;
}

// Convert `@local: <expression>;` by running the expression back through
// convert() as an ordinary declaration. Every guard above -- guards, mixin
// arguments, build-time functions, nested colour functions -- therefore applies
// to definitions too, with no second copy of the rules to keep in step.
function convertDefinitions(source, vars) {
  const unhandled = [];
  const lines = source.split('\n');
  const isLocal = name => !vars.has(name);

  lines.forEach((line, i) => {
    const commentAt = line.search(/(^|\s)\/\//);
    const code = commentAt === -1 ? line : line.slice(0, commentAt);
    const comment = commentAt === -1 ? '' : line.slice(commentAt);

    const def = code.match(/^(\s*@([a-zA-Z][a-zA-Z0-9-]*)\s*:\s*)(.+?);\s*$/);
    if (!def) return;
    const [, prefix, name, rhs] = def;
    if (!isLocal(name)) return;
    // Only definitions that actually pull in a theme variable.
    if (![...rhs.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)].some(m => vars.has(m[1]))) {
      return;
    }

    const unsafe = localUsedUnsafely(lines, name, i);
    if (unsafe.length) {
      unhandled.push({
        line: i + 1,
        text: line.trim(),
        reason: `@${name} is ${unsafe[0]}`
      });
      return;
    }

    const probe = `  x: ${rhs};`;
    const { output, unhandled: probeUnhandled } = convert(probe, vars, true);
    if (probeUnhandled.length) {
      unhandled.push({
        line: i + 1,
        text: line.trim(),
        reason: probeUnhandled[0].reason
      });
      return;
    }
    if (output === probe) return;

    let value = output.replace(/^\s*x:\s*/, '').replace(/;\s*$/, '');
    // convert() escapes what LESS would otherwise try to parse. A result that
    // is not already escaped becomes one here, so the local holds a string in
    // every case and behaves the same way at every use site.
    if (!/^~"/.test(value)) value = esc(value);
    lines[i] = prefix + value + ';' + comment;
  });

  return { output: lines.join('\n'), unhandled };
}

function convert(source, vars, skipDefinitions) {
  const unhandled = [];
  const lines = source.split('\n');

  const out = lines.map((line, i) => {
    // Analyse and rewrite code only. A trailing // comment that quotes LESS
    // -- e.g. a note recording what an expression was before conversion --
    // otherwise trips the colour-function and arithmetic detectors, and the
    // `//` itself reads as two divisions. Split it off and put it back.
    // `http://` is not a comment: require whitespace or line start before //.
    const commentAt = line.search(/(^|\s)\/\//);
    const code = commentAt === -1 ? line : line.slice(0, commentAt);
    const comment = commentAt === -1 ? '' : line.slice(commentAt);

    // Never rewrite the variable definitions themselves, or imports.
    if (/^\s*@[a-zA-Z][a-zA-Z0-9-]*\s*:/.test(code)) return line;
    if (/^\s*@import\b/.test(code)) return line;

    // Guards and build-time functions (contrast, hsvvalue) need a real value,
    // which a custom property is not until the browser resolves it. These have
    // to stay LESS variables or be rewritten by hand.
    if (/\bwhen\s*\(/.test(code)) {
      if ([...code.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)].some(m => vars.has(m[1]))) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'less-guard' });
      }
      return line;
    }
    // A mixin call passes the value into LESS, where the body may do colour
    // maths on it (.make-type-icon runs hsvvalue/contrast on its argument).
    // var() is opaque to all of that.
    if (/^\s*[.#][-\w]+[^{};]*\([^)]*\)\s*;/.test(code)) {
      if ([...code.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)].some(m => vars.has(m[1]))) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'mixin-argument' });
      }
      return line;
    }
    const BUILD_TIME_FNS = /\b(contrast|hsvvalue|hsvhue|hsvsaturation|luma|luminance|lightness|saturation|hue|red|green|blue|alpha|ceil|floor|round|percentage|unit|isnumber|iscolor)\s*\(/;
    if (BUILD_TIME_FNS.test(code)) {
      if ([...code.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)].some(m => vars.has(m[1]))) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'build-time-fn' });
      }
      return line;
    }

    let result = code;

    // Nested colour functions -- fadeout(darken(@c, 4%), 55%) -- would need
    // the two transforms composed into one relative-colour expression. That is
    // a colour-expression compiler, not a rewrite; converting only the inner
    // call leaves LESS's outer function holding an escaped string, which fails
    // the build. Refuse the whole line.
    const COLOUR_FN = '(?:darken|lighten|fade|fadeout|fadein|mix|contrast|saturate|desaturate|tint|shade)';
    if (new RegExp(COLOUR_FN + '\\s*\\([^)]*' + COLOUR_FN + '\\s*\\(').test(code)) {
      if ([...code.matchAll(/@([a-zA-Z][a-zA-Z0-9-]*)/g)].some(m => vars.has(m[1]))) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'nested-colour-fn' });
      }
      return line;
    }

    // 1a. mix(a, b, W%) -> color-mix(in srgb, a W%, b); equivalent to LESS's
    //     sRGB interpolation, and both default to 50%. At least one operand
    //     must be a theme variable or there is nothing to convert.
    const operand = tok =>
      tok.startsWith('@')
        ? (vars.has(tok.slice(1)) ? `var(--${tok.slice(1)})` : null)
        : tok;
    result = result.replace(
      /\bmix\(\s*(@?[a-zA-Z0-9#.-]+)\s*,\s*(@?[a-zA-Z0-9#.-]+)\s*(?:,\s*([0-9.]+)%\s*)?\)/g,
      (whole, a, b, pct) => {
        const touchesTheme =
          (a.startsWith('@') && vars.has(a.slice(1))) ||
          (b.startsWith('@') && vars.has(b.slice(1)));
        if (!touchesTheme) return whole;
        const left = operand(a);
        const right = operand(b);
        if (!left || !right) {
          unhandled.push({ line: i + 1, text: line.trim(), reason: 'mix-local-var' });
          return whole;
        }
        const weight = pct === undefined ? '50' : pct;
        return esc(`color-mix(in srgb, ${left} ${weight}%, ${right})`);
      }
    );

    // 1. colour functions wrapping a theme variable
    result = result.replace(
      /\b(darken|lighten|fade|fadeout|fadein)\(\s*@([a-zA-Z][a-zA-Z0-9-]*)\s*,\s*([0-9.]+)%\s*\)/g,
      (whole, fn, name, pct) =>
        vars.has(name) ? COLOR_FNS[fn](name, Number(pct)) : whole
    );

    // 2. arithmetic. `*` and `/` by a plain number are safe -- the unit comes
    //    from the variable -- as is `+`/`-` when the operand carries a unit or
    //    both sides are variables. `+`/`-` with a bare number is not, and is
    //    reported: LESS infers the unit, CSS calc() cannot.
    //
    //    Chained arithmetic is reported too, since wrapping one term changes
    //    association. "Chained" is decided per match, not per line: a line
    //    count reads the hyphen in `@font-size` as a minus and a trailing
    //    `//` as two divisions.
    const isOperator = ch => ch === '*' || ch === '/' || ch === '+' || ch === '-';
    const precededByExpression = (offset, end) => {
      let j = offset - 1;
      while (j >= 0 && result[j] === ' ') j--;
      if (j < 0) return false;
      if (isOperator(result[j])) return true;
      if (result[j] === '(') {
        // `(@pad / 2)` is LESS grouping a single term, not a larger
        // expression: safe if the paren closes right after the operand.
        let k = end;
        while (k < result.length && result[k] === ' ') k++;
        return result[k] !== ')';
      }
      return false;
    };
    const followedByExpression = end => {
      let j = end;
      while (j < result.length && result[j] === ' ') j++;
      return j < result.length && isOperator(result[j]);
    };

    // `-@var` is negation, not subtraction; left alone step 3 emits
    // `-var(--x)`, which is invalid. The negated variable must be the whole
    // term, or the rest of the expression dangles outside the calc().
    result = result.replace(
      /(^|[\s:,(])-\s*@([a-zA-Z][a-zA-Z0-9-]*)(?![a-zA-Z0-9-])(\s*[*/+-]?)/g,
      (whole, lead, name, trailer) => {
        if (!vars.has(name)) return whole;
        if (trailer.trim() !== '') {
          unhandled.push({ line: i + 1, text: line.trim(), reason: 'negated-expression' });
          return whole;
        }
        return `${lead}calc(var(--${name}) * -1)${trailer}`;
      }
    );
    // Number-first multiplication (`2 * @pad`). The rule below matches only
    // variable-first, so these passed silently -- worse than a refusal, since
    // the count then calls the file clean. Safe because multiplication
    // commutes; only `*`, as `2 / @pad` and `2 + @pad` are not equivalent.
    result = result.replace(
      /(^|[\s:,(])([0-9.]+)\s*\*\s*@([a-zA-Z][a-zA-Z0-9-]*)(?![a-zA-Z0-9-])/g,
      (whole, lead, factor, name, offset) => {
        if (!vars.has(name)) return whole;
        if (followedByExpression(offset + whole.length)) {
          unhandled.push({ line: i + 1, text: line.trim(), reason: 'chained' });
          return whole;
        }
        return `${lead}calc(${factor} * var(--${name}))`;
      }
    );
    const rewriteArithmetic = (whole, name, op, operand, offset) => {
      if (!vars.has(name)) return whole;
      if (
        precededByExpression(offset, offset + whole.length) ||
        followedByExpression(offset + whole.length)
      ) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'chained' });
        return whole;
      }
      const operandIsVar = operand.startsWith('@');
      if (operandIsVar && !vars.has(operand.slice(1))) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'local-var' });
        return whole;
      }
      const bareNumber = !operandIsVar && /^[0-9.]+$/.test(operand);
      if ((op === '+' || op === '-') && bareNumber) {
        unhandled.push({ line: i + 1, text: line.trim(), reason: 'unit-ambiguous' });
        return whole;
      }
      const right = operandIsVar ? `var(--${operand.slice(1)})` : operand;
      return `calc(var(--${name}) ${op} ${right})`;
    };

    // Two patterns, not one with [*/+-]. A variable name may contain hyphens
    // and `-` is also an operator, so a single pattern backtracks: given
    // `@text-color-subtle` there is no operator after the full name, so the
    // engine settles for name `text-color`, operator `-`, operand `subtle` and
    // emits calc(var(--text-color) - subtle). That is not a colour, and the
    // browser drops the declaration -- 209 of them across 46 stylesheets.
    //
    // LESS reads `@a-b` as one identifier; subtraction needs spaces around the
    // minus. The detection above already required that, so only the rewrite
    // was wrong.
    result = result.replace(
      /@([a-zA-Z][a-zA-Z0-9-]*)\s+(-)\s+(@?[a-zA-Z0-9.]+[a-z%]*)/g,
      rewriteArithmetic
    );
    result = result.replace(
      /@([a-zA-Z][a-zA-Z0-9-]*)\s*([*/+])\s*(@?[a-zA-Z0-9.]+[a-z%]*)/g,
      rewriteArithmetic
    );

    // 3. plain references (skip any left inside an arithmetic expression)
    result = result.replace(
      /@([a-zA-Z][a-zA-Z0-9-]*)/g,
      (whole, name, offset) => {
        if (!vars.has(name)) return whole;
        const after = result.slice(offset + whole.length);
        const before = result.slice(0, offset);
        // `@name:` is a definition, not a reference -- including inside a
        // mixin body on a line that starts with something else, which is why
        // the line-anchored guard above is not enough:
        //   .attr-syntax-color() { @syntax-color-attribute: #888; }
        if (/^\s*:/.test(after)) return whole;
        if (/^\s*[*/+-]\s*[0-9@.]/.test(after)) return whole;
        if (/[0-9)]\s*[*/+-]\s*$/.test(before)) return whole;
        return `var(--${name})`;
      }
    );

    // Safety net: enumerating every LESS construct that consumes a build-time
    // value is whack-a-mole, so instead abandon the line if an introduced
    // var() landed inside any function LESS evaluates itself.
    const CSS_FNS = new Set([
      'calc', 'var', 'hsl', 'hsla', 'rgb', 'rgba', 'color-mix', 'url',
      'linear-gradient', 'radial-gradient', 'translate', 'translateX',
      'translateY', 'scale', 'rotate', 'cubic-bezier', 'min', 'max', 'clamp',
      'env', 'attr', 'counter', 'repeat', 'minmax', 'fit-content'
    ]);
    if (result !== line && result.includes('var(--')) {
      // A LESS variable still doing arithmetic next to a var() we introduced:
      // `@size + (calc(var(--pad) * 2))`. LESS evaluates the sum and cannot
      // add a calc(), so it crashes on the unit.
      if (/@[a-zA-Z][a-zA-Z0-9-]*\s*[*/+-]/.test(result) ||
          /[*/+-]\s*\(?\s*@[a-zA-Z]/.test(result)) {
        unhandled.push({
          line: i + 1,
          text: line.trim(),
          reason: 'mixed LESS/CSS arithmetic'
        });
        return line;
      }
      for (const m of result.matchAll(/([a-zA-Z][a-zA-Z0-9-]*)\s*\(/g)) {
        if (CSS_FNS.has(m[1])) continue;
        const open = m.index + m[0].length;
        let depth = 1;
        let k = open;
        while (k < result.length && depth > 0) {
          if (result[k] === '(') depth++;
          else if (result[k] === ')') depth--;
          k++;
        }
        if (result.slice(open, k).includes('var(--')) {
          unhandled.push({
            line: i + 1,
            text: line.trim(),
            reason: `var() inside LESS ${m[1]}()`
          });
          return line;
        }
      }
    }

    return result + comment;
  });

  let output = out.join('\n');
  if (!skipDefinitions) {
    const defs = convertDefinitions(output, vars);
    output = defs.output;
    unhandled.push(...defs.unhandled);
  }
  return { output, unhandled };
}

// Identify a theme by the `theme` field of its nearest enclosing package.json,
// walking up from the file. Name matching is wrong twice over: `lsp-ui` ends in
// -ui and is an ordinary package, and themes also appear nested as spec
// fixtures (dev-live-reload/spec/fixtures/theme-with-ui-variables).
function isThemeStylesheet(file) {
  let dir = path.dirname(path.resolve(file));
  const stop = path.resolve(ROOT);
  while (dir.startsWith(stop)) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        const { theme } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        return theme === 'ui' || theme === 'syntax';
      } catch (e) {
        return false;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

// Specs own their fixtures; rewriting them changes what the test exercises.
function isFixture(file) {
  const parts = path.resolve(file).split(path.sep);
  return parts.includes('spec') || parts.includes('test');
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
      // Identify themes by their `theme` field, not their name: lsp-ui ends in
      // -ui and is an ordinary package whose stylesheets do need converting.
      if (isThemeStylesheet(file) || isFixture(file)) continue;
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
      console.log(`  ${u.file}:${u.line}  [${u.reason}]  ${u.text}`);
    }
    if (allUnhandled.length > 40) {
      console.log(`  … and ${allUnhandled.length - 40} more`);
    }
  }
}

main();
