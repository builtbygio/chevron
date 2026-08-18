'use strict';

/**
 * Chevron-primary API aliases (static checks; avoid loading native pathwatcher
 * under host Node).
 * Run: node --test script/ci/chevron-api-alias.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const exportsPath = path.join(ROOT, 'exports');

describe('chevron package API exports', () => {
  it('exports/atom.js is gone; exports/chevron.js is the only package API', () => {
    assert.ok(
      !fs.existsSync(path.join(exportsPath, 'atom.js')),
      'exports/atom.js was removed in PR 23; require("atom") is unsupported'
    );
    const chevronSrc = fs.readFileSync(
      path.join(exportsPath, 'chevron.js'),
      'utf8'
    );
    assert.ok(
      /module\.exports\s*=/.test(chevronSrc),
      'chevron.js must export the API object'
    );
    assert.ok(
      chevronSrc.includes('BufferedProcess') && chevronSrc.includes('Emitter'),
      'chevron.js should export core package API symbols'
    );
  });

  it('initialize-application-window sets global.chevron, and atom as an alias', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/initialize-application-window.js'),
      'utf8'
    );
    assert.ok(src.includes('global.chevron'), 'must set global.chevron');
    // The global alias stays: 1360 bare `atom.` references survive across 57
    // bundled packages. Removing it is a catalog stream, not a core edit.
    assert.ok(/global\.atom\s*=/.test(src), 'global.atom alias still required');
  });

  it('no core source READS the global.atom alias', () => {
    // Assigning it is required (bundled packages depend on the global);
    // reading it from core is not. main-process global.atomApplication is a
    // different object and out of scope for PR 23.
    const roots = ['src', 'static', 'exports'];
    const hits = [];
    const walk = dir => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(js|ts)$/.test(e.name)) {
          const text = fs.readFileSync(full, 'utf8');
          for (const line of text.split('\n')) {
            const t = line.trimStart();
            if (t.startsWith('//') || t.startsWith('*')) continue;
            if (/global\.atom\s*=/.test(line)) continue; // the assignment
            if (/global\.atom\b(?!Application)/.test(line)) {
              hits.push(path.relative(ROOT, full));
              break;
            }
          }
        }
      }
    };
    for (const r of roots) walk(path.join(ROOT, r));
    assert.deepStrictEqual(hits, [], `global.atom still read in:\n${hits.join('\n')}`);
  });

  it('main process sets chevronApplication + atomApplication alias', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/main-process/atom-application.js'),
      'utf8'
    );
    assert.ok(src.includes('global.chevronApplication'));
    assert.ok(src.includes('global.atomApplication'));
  });

  it('module-cache registers chevron and no atom builtin', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/module-cache.js'), 'utf8');
    assert.ok(
      /cache\.builtins\.chevron\s*=/.test(src),
      'must register builtins.chevron'
    );
    assert.ok(
      !/cache\.builtins\.atom\s*=/.test(src),
      'builtins.atom was removed in PR 23; it pointed at a deleted file'
    );
  });
});
