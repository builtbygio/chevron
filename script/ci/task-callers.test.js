'use strict';

/**
 * Product code must not call Task. The public export stays until Wave 3.
 * Run: node --test script/ci/task-callers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('Task callers (H2 PR 14a)', () => {
  it('does not delete Task from core', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'task.ts')));
    const exp = read('exports/chevron.js');
    assert.match(exp, /Task/);
  });

  it('fuzzy-finder path-loader does not require Task', () => {
    const src = read('node_modules/fuzzy-finder/lib/path-loader.js');
    assert.ok(!/require\(['"]chevron['"]\)/.test(src) || !/Task/.test(src));
    assert.ok(!/Task\.once/.test(src));
  });

  it('symbols-view tag-reader does not call Task.once', () => {
    const src = read('node_modules/symbols-view/lib/tag-reader.js');
    assert.ok(!/Task\.once/.test(src));
  });

  it('Workspace.replace does not call Task', () => {
    const src = read('src/workspace.js');
    assert.doesNotMatch(src, /require\(['"]\.\/task['"]\)/);
    assert.doesNotMatch(src, /Task\.once/);
    assert.match(src, /replaceInFiles/);
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'src', 'replace-handler.ts')),
      'replace-handler.ts was the Task worker; replaceInFiles runs in-process'
    );
  });
});
