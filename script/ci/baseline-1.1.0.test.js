'use strict';

/**
 * 1.1.0 product contract. Runs in unit-and-cpm (no root node_modules).
 * Later modernization waves must not flip these without a dedicated PR.
 * Run: node --test script/ci/baseline-1.1.0.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const pkg = JSON.parse(read('package.json'));

describe('1.1.0 product contract', () => {
  it('default UI/syntax themes are One Dark', () => {
    const schema = read('src/config-schema.js');
    assert.match(schema, /default:\s*\['one-dark-ui',\s*'one-dark-syntax'\]/);
    const themes = read('src/theme-manager.js');
    assert.match(themes, /themeNames = \['one-dark-syntax', 'one-dark-ui'\]/);
  });

  it('package host v2 routing defaults off', () => {
    const schema = read('src/config-schema.js');
    // Package host v2 was removed with the community-package decision; the
    // 1.1.0 contract pinned it to default false, which no longer applies.
    assert.doesNotMatch(schema, /packageHostV2/);
  });

  it('season is gone (the condition this gated on has been met)', () => {
    // The 1.1.0 contract kept season until pin CSON and the user dual-read
    // were gone. Both are: nothing in the repository is CSON, core reads JSON
    // through src/main-process/json-file.js, and first-mate is patched off it.
    assert.ok(
      !pkg.dependencies.season,
      'season must not be declared once nothing reads CSON'
    );
  });

  it('the atom:// alias is gone (Wave 4 superseded the 1.1.0 contract here)', () => {
    // 1.1.0 locked atom:// in place as a deprecated alias. Wave 4 removed it
    // once image-view 0.64.3 cleared the last shipped emitter;
    // script/ci/uri-scheme.test.js is the live gate.
    const ws = read('src/workspace.js');
    assert.doesNotMatch(ws, /function alternateSchemeURI/);
    const registry = read('src/uri-handler-registry.js');
    assert.doesNotMatch(registry, /protocol !== 'atom:'/);
  });

  it('Task is gone (Wave 3 superseded the 1.1.0 contract here)', () => {
    // 1.1.0 locked the Task export in place. Wave 3 removed it once the grep
    // proved zero callers; script/ci/task-callers.test.js is the live gate.
    assert.ok(!fs.existsSync(path.join(ROOT, 'src', 'task.ts')));
    assert.doesNotMatch(read('exports/chevron.js'), /chevronExport\.Task\s*=/);
    const ws = read('src/workspace.js');
    assert.doesNotMatch(ws, /Task\.once/);
    assert.match(ws, /replaceInFiles/);
  });

  it('first-mate and document-register-element stay', () => {
    assert.ok(pkg.dependencies['first-mate'], 'first-mate is the TextMate fallback');
    assert.ok(
      pkg.dependencies['document-register-element'],
      'document-register-element stays until catalog createElement is converted'
    );
  });

  it('github is an npm pin, not a git SHA', () => {
    const spec = pkg.dependencies.github;
    assert.ok(
      String(spec) === 'workspace:@builtbygio/github@*',
      `github is an in-repo editor package now, got ${spec}`
    );
  });
});
