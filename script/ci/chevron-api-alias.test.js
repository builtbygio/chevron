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

describe('chevron / atom package API exports', () => {
  it('exports/atom.js re-exports exports/chevron.js', () => {
    const atomSrc = fs.readFileSync(path.join(exportsPath, 'atom.js'), 'utf8');
    const chevronSrc = fs.readFileSync(
      path.join(exportsPath, 'chevron.js'),
      'utf8'
    );
    assert.ok(
      /require\(\s*['"]\.\/chevron['"]\s*\)/.test(atomSrc),
      'atom.js must re-export ./chevron'
    );
    assert.ok(
      /module\.exports\s*=\s*chevronExport/.test(chevronSrc) ||
        /module\.exports\s*=/.test(chevronSrc),
      'chevron.js must export the API object'
    );
    assert.ok(
      chevronSrc.includes('BufferedProcess') && chevronSrc.includes('Emitter'),
      'chevron.js should export core package API symbols'
    );
  });

  it('initialize-application-window sets global.chevron and global.atom', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/initialize-application-window.js'),
      'utf8'
    );
    assert.ok(src.includes('global.chevron'), 'must set global.chevron');
    assert.ok(src.includes('global.atom'), 'must keep global.atom alias');
  });

  it('main process sets chevronApplication + atomApplication alias', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/main-process/atom-application.js'),
      'utf8'
    );
    assert.ok(src.includes('global.chevronApplication'));
    assert.ok(src.includes('global.atomApplication'));
  });
});
