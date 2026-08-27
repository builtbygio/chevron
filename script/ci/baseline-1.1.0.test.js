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
    assert.match(schema, /packageHostV2:\s*\{[\s\S]*?default:\s*false/);
  });

  it('season stays (dual-read CSON + pin grammars)', () => {
    assert.ok(
      pkg.dependencies.season,
      'season must stay until pin CSON and user dual-read are gone'
    );
    assert.ok(
      String(pkg.dependencies.season).startsWith('npm:@builtbygio/season@'),
      `season must be npm:@builtbygio/season, got ${pkg.dependencies.season}`
    );
  });

  it('atom:// remains a deprecated alias for chevron://', () => {
    const ws = read('src/workspace.js');
    assert.match(ws, /function alternateSchemeURI/);
    assert.match(ws, /uri\.startsWith\('atom:\/\/'\)/);
    const registry = read('src/uri-handler-registry.js');
    assert.match(registry, /protocol !== 'atom:'/);
  });

  it('Task export stays; Workspace.replace does not call Task', () => {
    assert.ok(fs.existsSync(path.join(ROOT, 'src', 'task.ts')));
    assert.match(read('exports/chevron.js'), /Task/);
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
      String(spec).startsWith('npm:@builtbygio/github@'),
      `github must be npm:@builtbygio/github@ver, got ${spec}`
    );
  });
});
