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

  it('dropped Coffee/Babel no-op transpile from script/build', () => {
    const build = read('script/build');
    assert.ok(!build.includes('transpileBabelPaths'));
    assert.ok(!build.includes('transpileCoffeeScriptPaths'));
    assert.ok(!fs.existsSync(path.join(SCRIPT, 'lib', 'transpile-babel-paths.js')));
    assert.ok(
      !fs.existsSync(path.join(SCRIPT, 'lib', 'transpile-coffee-script-paths.js'))
    );
  });

  it('the CSON, PEG.js and custom-transpiler steps are gone', () => {
    // Each was kept while it still had inputs. None does now: Wave 1 proved
    // zero shipped `.cson` across all 94 pins and the app tree, there is no
    // `.pegjs` source in the repo, and no package declares `atomTranspilers`.
    const build = read('script/build');
    for (const name of [
      'transpile-cson-paths',
      'transpile-peg-js-paths',
      'transpile-packages-with-custom-transpiler-paths'
    ]) {
      assert.ok(!build.includes(name), `script/build still calls ${name}`);
      assert.ok(
        !fs.existsSync(path.join(SCRIPT, 'lib', `${name}.js`)),
        `${name}.js should be deleted`
      );
    }
  });

  it('generate-api-docs and its CoffeeScript toolchain are gone', () => {
    // It wrote docs/output/atom-api.json, which is untracked and which nothing
    // consumed once script/vsts/ was deleted. donna is CoffeeScript, so this
    // removed the last CoffeeScript from the build.
    const build = read('script/build');
    assert.ok(!build.includes('generate-api-docs'));
    assert.ok(!build.includes('generateAPIDocs'));
    assert.ok(!fs.existsSync(path.join(SCRIPT, 'lib', 'generate-api-docs.js')));
    const pkg = JSON.parse(read('script/package.json'));
    for (const dep of ['donna', 'joanna', 'tello', 'coffeelint']) {
      assert.ok(!pkg.dependencies[dep], `script/package.json still pulls ${dep}`);
    }
  });

  it('the CoffeeScript linter is gone with the sources it linted', () => {
    // It globbed dot-chevron/**/*.coffee, src/**/*.coffee and spec/*.coffee —
    // all empty — and script/lint never ran in GitHub CI anyway.
    const lint = read('script/lint');
    assert.ok(!lint.includes('lint-coffee-script-paths'));
    assert.ok(
      !fs.existsSync(path.join(SCRIPT, 'lib', 'lint-coffee-script-paths.js'))
    );
    assert.ok(!fs.existsSync(path.join(ROOT, 'coffeelint.json')));
  });

  it('the chromedriver harness is gone', () => {
    // Only spec/integration/ used it, nothing ran that, and script/ci/
    // smoke-test.js is the harness Chevron actually uses.
    assert.ok(
      !fs.existsSync(path.join(SCRIPT, 'lib', 'check-chromedriver-version.js'))
    );
    assert.ok(!fs.existsSync(path.join(ROOT, 'spec', 'integration')));
    const pkg = JSON.parse(read('script/package.json'));
    assert.ok(!pkg.dependencies['electron-chromedriver']);
    assert.ok(fs.existsSync(path.join(SCRIPT, 'ci', 'smoke-test.js')));
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
