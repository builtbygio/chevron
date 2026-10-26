'use strict';

/**
 * The Jasmine harness defines `window.chevron` and does not invent `window.atom`.
 * Run: node --test script/ci/spec-harness-globals.test.js
 *
 * Specs and bundled packages call `chevron.*`. The harness builds its own
 * environment, independent of the editor's global. Run 32140370725 failed
 * 37 of 37 suites because `chevron` was undefined in the spec window.
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const runner = fs.readFileSync(
  path.join(ROOT, 'spec/jasmine-test-runner.js'),
  'utf8'
);

describe('spec harness globals', () => {
  it('defines window.chevron', () => {
    assert.match(runner, /window\.chevron\s*=/);
  });

  it('does not define window.atom', () => {
    assert.doesNotMatch(runner, /window\.atom\s*=/);
  });

  it('specs do not read a bare atom global', () => {
    // `atomEnvironment: atom` survived the rename: the value patterns only
    // matched `atom.` and `= atom`, so `: atom` stayed, and this file's 44
    // examples threw ReferenceError on nightly core-render-2.
    const ident = /(?<![.\w$-])atom(?![\w$-])/g;
    const hits = [];
    const scan = file => {
      const text = fs.readFileSync(file, 'utf8');
      let block = false;
      text.split('\n').forEach((line, i) => {
        let rest = line;
        if (block) {
          const end = rest.indexOf('*/');
          if (end === -1) return;
          rest = rest.slice(end + 2);
          block = false;
        }
        let code = '';
        let quote = null;
        for (let k = 0; k < rest.length; k++) {
          const c = rest[k];
          const n = rest[k + 1];
          if (quote) {
            if (c === '\\') { k++; continue; }
            if (c === quote) quote = null;
            continue;
          }
          if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
          if (c === '/' && n === '/') break;
          if (c === '/' && n === '*') {
            const end = rest.indexOf('*/', k + 2);
            if (end === -1) { block = true; break; }
            k = end + 1;
            continue;
          }
          code += c;
        }
        ident.lastIndex = 0;
        if (ident.test(code)) {
          hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
      });
    };
    const walk = dir => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          walk(full);
        } else if (/\.(js|ts|tsx)$/.test(entry.name)) scan(full);
      }
    };
    walk(path.join(ROOT, 'spec'));
    walk(path.join(ROOT, 'packages'));
    const specHits = hits.filter(h => /\/spec\/|-spec\.(js|ts|tsx):/.test('/' + h));
    assert.deepStrictEqual(specHits, []);
  });
});
