'use strict';

/**
 * H2 PR 16: new src/ files are TypeScript. Existing .js is grandfathered.
 * Convert on touch; do not mass-rename. Run:
 *   node --test script/ci/src-typescript-first.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const GRANDFATHER_PATH = path.join(__dirname, 'src-js-grandfather.json');

/**
 * Directories where the TypeScript-first rule does not apply.
 *
 * `src/main-process/**` must stay JavaScript:
 *
 *  - The main process never registers the TypeScript compile-cache
 *    (`src/compile-cache.js` is set up from the renderer boot), so main-side
 *    `require` cannot load `.ts` at all.
 *  - utilityProcess / child_process entry scripts are forked by **literal
 *    path** (e.g. `workers/package-host.js`). `script/build` transpiles
 *    `src/**\/*.ts` to `.js` and deletes the `.ts`, so a `.ts` worker entry
 *    would need one path in dev and another when packaged.
 *
 * This is a property of how those processes boot, not a backlog item. Nothing
 * under `src/main-process/` is `.ts` today.
 */
const EXEMPT_DIRS = ['src/main-process/'];

function isExempt(relPath) {
  return EXEMPT_DIRS.some(dir => relPath.startsWith(dir));
}

function walkJs(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJs(full, acc);
      continue;
    }
    if (entry.name.endsWith('.js')) {
      acc.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return acc;
}

describe('src/ TypeScript-on-touch (PR 16)', () => {
  const grandfather = JSON.parse(fs.readFileSync(GRANDFATHER_PATH, 'utf8'));
  const current = walkJs(SRC, []).sort();
  const allowed = new Set(grandfather);

  it('src/tsconfig.json exists and is loose emit-off', () => {
    const tsconfigPath = path.join(SRC, 'tsconfig.json');
    assert.ok(fs.existsSync(tsconfigPath), 'src/tsconfig.json is required');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
    const opts = tsconfig.compilerOptions || {};
    assert.strictEqual(opts.noEmit, true);
    assert.strictEqual(opts.noImplicitAny, false);
    assert.strictEqual(opts.strict, false);
    assert.strictEqual(opts.module, 'CommonJS');
    assert.ok(
      opts.target === 'ES2018' || opts.target === 'es2018',
      'target must match src/typescript.js (ES2018)'
    );
  });

  it('CONTRIBUTING states TypeScript-first for new src/ files', () => {
    const doc = fs.readFileSync(path.join(ROOT, 'CONTRIBUTING.md'), 'utf8');
    assert.match(doc, /TypeScript/);
    assert.match(doc, /src\//);
    assert.match(doc, /grandfather|on.touch|on-touch/i);
    assert.match(doc, /[Dd]o not mass-rename/);
  });

  it('does not add new src/**/*.js files', () => {
    const extras = current.filter(f => !allowed.has(f) && !isExempt(f));
    assert.deepStrictEqual(
      extras,
      [],
      'New src/**/*.js files are banned (PR 16). Add TypeScript instead.\n' +
        extras.map(f => `  + ${f}`).join('\n')
    );
  });

  it('exempt dirs contain no TypeScript (the exemption is real)', () => {
    // If someone lands .ts under an exempt dir, the exemption is wrong and
    // this rule should be revisited rather than silently widened.
    const stray = [];
    for (const dir of EXEMPT_DIRS) {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) continue;
      const walk = d => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full);
          else if (/\.tsx?$/.test(e.name)) {
            stray.push(path.relative(ROOT, full).split(path.sep).join('/'));
          }
        }
      };
      walk(abs);
    }
    assert.deepStrictEqual(
      stray,
      [],
      'TypeScript under an EXEMPT_DIR — main-process cannot load .ts:\n' +
        stray.map(f => `  + ${f}`).join('\n')
    );
  });

  it('has no source file git would call binary', () => {
    // A control byte in source is silently legal and silently awful: git
    // diffs the file as "Bin 7978 -> 9815 bytes", so every review of it shows
    // no code at all. src/package-profiler.ts shipped that way in #323,
    // because a bucket separator was written as a literal NUL rather than a
    // \u0000 escape. Nothing else would have caught it.
    const offenders = [];
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(js|ts|jsx|tsx|json)$/.test(entry.name)) continue;
        const bytes = fs.readFileSync(full);
        for (let i = 0; i < bytes.length; i++) {
          const byte = bytes[i];
          // Tab, newline and carriage return are the only control bytes a
          // source file has any business containing.
          if (byte === 9 || byte === 10 || byte === 13) continue;
          if (byte < 32 || byte === 127) {
            offenders.push(
              `${path.relative(ROOT, full)}: byte 0x${byte
                .toString(16)
                .padStart(2, '0')} at offset ${i}`
            );
            break;
          }
        }
      }
    };
    walk(SRC);
    assert.deepStrictEqual(
      offenders,
      [],
      'control bytes in source — write them as escapes, or git treats the ' +
        'file as binary and the diff becomes unreviewable:\n' +
        offenders.map(f => `  + ${f}`).join('\n')
    );
  });

  it('drops converted files from the grandfather list', () => {
    const missing = grandfather.filter(f => !current.includes(f));
    assert.deepStrictEqual(
      missing,
      [],
      'Grandfathered src/**/*.js missing from the tree — remove from ' +
        'script/ci/src-js-grandfather.json:\n' +
        missing.map(f => `  - ${f}`).join('\n')
    );
  });
});
