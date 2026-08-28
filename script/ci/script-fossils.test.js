'use strict';

/**
 * H1 PR 10: CI-invocation grep for script-tree Coffee/API-doc fossils.
 * Run: node --test script/ci/script-fossils.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'script');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walkJs(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJs(full, acc);
      continue;
    }
    if (entry.name.endsWith('.js') || entry.name === 'build' || entry.name === 'lint') {
      acc.push(full);
    }
  }
  return acc;
}

function githubWorkflowsMention(needle) {
  const dir = path.join(ROOT, '.github', 'workflows');
  for (const name of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(name)) continue;
    if (fs.readFileSync(path.join(dir, name), 'utf8').includes(needle)) {
      return true;
    }
  }
  return false;
}

describe('script-tree fossils (PR 10)', () => {
  it('script/test still exists (not deleted)', () => {
    assert.ok(fs.existsSync(path.join(SCRIPT, 'test')));
  });

  it('keeps live CSON transpile', () => {
    const build = read('script/build');
    assert.ok(build.includes("require('./lib/transpile-cson-paths')"));
    assert.ok(build.includes('transpileCsonPaths()'));
    assert.ok(fs.existsSync(path.join(SCRIPT, 'lib', 'transpile-cson-paths.js')));
  });

  it('dropped Coffee/Babel no-op transpile from script/build', () => {
    const build = read('script/build');
    assert.ok(!build.includes('transpileBabelPaths'));
    assert.ok(!build.includes('transpileCoffeeScriptPaths'));
    assert.ok(!fs.existsSync(path.join(SCRIPT, 'lib', 'transpile-babel-paths.js')));
    assert.ok(
      !fs.existsSync(path.join(SCRIPT, 'lib', 'transpile-coffee-script-paths.js'))
    );
  });

  it('donna/joanna/tello stay — generate-api-docs runs from script/build', () => {
    const build = read('script/build');
    assert.ok(build.includes("require('./lib/generate-api-docs')"));
    const docs = read('script/lib/generate-api-docs.js');
    assert.ok(docs.includes("require('coffee-script/register')"));
    assert.ok(docs.includes("require('donna')"));
    assert.ok(docs.includes("require('joanna')"));
    assert.ok(docs.includes("require('tello')"));
    const pkg = JSON.parse(read('script/package.json'));
    assert.ok(pkg.dependencies.donna);
    assert.ok(pkg.dependencies.joanna);
    assert.ok(pkg.dependencies.tello);
  });

  it('coffeelint stays — script/lint still requires it (not GitHub CI)', () => {
    const lint = read('script/lint');
    assert.ok(lint.includes('lint-coffee-script-paths'));
    const coffeeLint = read('script/lib/lint-coffee-script-paths.js');
    assert.ok(coffeeLint.includes("require('coffeelint')"));
    const pkg = JSON.parse(read('script/package.json'));
    assert.ok(pkg.dependencies.coffeelint);
    assert.strictEqual(
      githubWorkflowsMention('script/lint'),
      false,
      'GitHub Actions must not grow a script/lint job without revisiting this dep'
    );
  });

  it('script babel-core is unused and removed', () => {
    const pkg = JSON.parse(read('script/package.json'));
    assert.strictEqual(pkg.dependencies['babel-core'], undefined);
    const files = walkJs(SCRIPT, []);
    const hits = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      if (/require\(['"]babel-core['"]\)/.test(text)) {
        hits.push(path.relative(ROOT, file));
      }
    }
    assert.deepStrictEqual(hits, []);
  });
});
