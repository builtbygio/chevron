'use strict';

/**
 * Wave 3 deleted Task. Nothing may reintroduce it.
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

describe('Task is gone (Wave 3)', () => {
  it('the module, its worker shell and its spec are deleted', () => {
    for (const rel of [
      'src/task.ts',
      'src/task-bootstrap.js',
      'spec/task-spec.js',
      'spec/fixtures/task-spec-handler.js',
      'spec/fixtures/task-handler-with-deprecations.js'
    ]) {
      assert.ok(!fs.existsSync(path.join(ROOT, rel)), `${rel} should be gone`);
    }
  });

  it('the public export is gone', () => {
    const exp = read('exports/chevron.js');
    assert.doesNotMatch(exp, /chevronExport\.Task\s*=/);
    assert.doesNotMatch(exp, /require\(['"]\.\.\/src\/task['"]\)/);
  });

  it('no owned pin calls Task', () => {
    // The Wave 3 gate. github/lib/async-queue.js declares its own local
    // `class Task` with no requires at all — not the chevron export.
    const pkg = JSON.parse(read('package.json'));
    const names = Object.keys(pkg.packageDependencies || {});
    assert.ok(names.length >= 90, `catalog shrank to ${names.length}`);
    const offenders = [];
    for (const name of names) {
      const root = ['packages', 'node_modules']
        .map(d => path.join(ROOT, d, name))
        .find(fs.existsSync);
      if (!root) continue;
      const walk = dir => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (['node_modules', 'spec', 'test', '.git'].includes(ent.name))
            continue;
          const full = path.join(dir, ent.name);
          if (ent.isDirectory()) walk(full);
          else if (/\.(js|ts|coffee)$/.test(ent.name)) {
            let src;
            try {
              src = fs.readFileSync(full, 'utf8');
            } catch {
              continue;
            }
            if (/\bTask\.once\s*\(/.test(src)) {
              offenders.push(`${name}/${path.relative(root, full)}`);
            }
          }
        }
      };
      walk(root);
    }
    assert.deepStrictEqual(offenders, [], `Task.once callers: ${offenders}`);
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
