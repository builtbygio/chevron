'use strict';

/**
 * Stream E: dependency graph guards.
 * Run: node --test script/ci/dep-graph.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const {
  classifySpec,
  summarizeDependencies,
  FORBIDDEN_APP_DEPS
} = require('../lib/dep-graph');
const {
  DECAFFEINATE_PACKAGES,
  DEBABEL_PACKAGES,
  SAFETY_NET_PATCHES
} = require('../lib/patch-bridge-inventory');

describe('classifySpec', () => {
  it('classifies file / workspace / git / semver', () => {
    assert.strictEqual(classifySpec('file:packages/about'), 'file');
    assert.strictEqual(classifySpec('workspace:*'), 'workspace');
    assert.strictEqual(
      classifySpec('npm:@builtbygio/about@1.9.3'),
      'npm-builtbygio'
    );
    assert.strictEqual(
      classifySpec('workspace:@builtbygio/about@*'),
      'workspace'
    );
    assert.strictEqual(classifySpec('workspace:*'), 'workspace');
    assert.strictEqual(classifySpec('workspace:^1.0.0'), 'workspace');
    assert.strictEqual(
      classifySpec('git+https://github.com/atom/foo.git#abc'),
      'git-atom'
    );
    assert.strictEqual(
      classifySpec('git+https://github.com/builtbygio/foo.git#abc'),
      'git-builtbygio'
    );
    assert.strictEqual(classifySpec('1.2.3'), 'semver');
    assert.strictEqual(classifySpec('^4.0.0'), 'semver');
  });
});

describe('root dependency graph', () => {
  const { counts, lists } = summarizeDependencies(pkg);

  it('does not depend on forbidden compile-cache runtimes', () => {
    for (const name of FORBIDDEN_APP_DEPS) {
      assert.ok(!pkg.dependencies[name], `unexpected app dep ${name}`);
    }
  });

  it('overrides nan to 2.28.0 (Stream B / keytar)', () => {
    assert.ok(pkg.overrides, 'package.json overrides missing');
    assert.strictEqual(pkg.overrides.nan, '2.28.0');
  });

  it('overrides runtime SCA hotspots (marked / DOMPurify / dugite tar)', () => {
    assert.strictEqual(pkg.overrides.dompurify, '3.4.13');
    assert.strictEqual(pkg.overrides.marked, '4.3.0');
    assert.ok(pkg.overrides.dugite, 'dugite override missing');
    assert.strictEqual(pkg.overrides.dugite.tar, '7.5.21');
  });

  it('keeps atom/* git pin count from growing past known ceiling', () => {
    // #79 closed: no app atom/* git pins. Do not add new ones.
    const CEILING = 0;
    assert.ok(
      counts['git-atom'] <= CEILING,
      `atom/* git pins ${counts['git-atom']} > ceiling ${CEILING}: ${lists['git-atom'].join(', ')}`
    );
  });

  it('reports a non-zero owned-pin set', () => {
    assert.ok(counts['git-builtbygio'] >= 20);
  });

  it('installs app deps with pnpm and a frozen lockfile in CI', () => {
    const install = fs.readFileSync(
      path.join(ROOT, 'script', 'lib', 'install-app-dependencies.js'),
      'utf8'
    );
    assert.ok(install.includes('getPnpmBinPath'));
    assert.ok(install.includes('--frozen-lockfile'));
    const workspace = fs.readFileSync(
      path.join(ROOT, 'pnpm-workspace.yaml'),
      'utf8'
    );
    assert.ok(workspace.includes('strictPeerDependencies: false'));
    assert.ok(workspace.includes('nodeLinker: hoisted'));
    assert.ok(workspace.includes('blockExoticSubdeps: false'));
  });

  it('commits pnpm-lock.yaml as the app-tree lockfile', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'pnpm-workspace.yaml')),
      'missing pnpm-workspace.yaml'
    );
    assert.ok(
      fs.existsSync(path.join(ROOT, 'pnpm-lock.yaml')),
      'missing pnpm-lock.yaml'
    );
  });

  it('mocha is 11.x (still CJS; mocha 12 is the ESM rewrite)', () => {
    assert.match(String(pkg.dependencies.mocha), /^11\./);
  });

  it('in-repo catalog packages install from the workspace as @builtbygio aliases', () => {
    const packagesDir = path.join(ROOT, 'packages');
    let pinned = 0;
    for (const dir of fs.readdirSync(packagesDir)) {
      const metaPath = path.join(packagesDir, dir, 'package.json');
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      const npmName = meta.name;
      if (!npmName || !npmName.startsWith('@builtbygio/')) continue;
      const id = npmName.slice('@builtbygio/'.length);
      const depKey = id === 'watcher' ? '@atom/watcher' : id;
      const spec = pkg.dependencies[depKey];
      if (!spec) continue;
      assert.strictEqual(
        spec,
        `workspace:${npmName}@*`,
        `${depKey} should pin workspace:${npmName}@*`
      );
      pinned += 1;
      const bundled = pkg.packageDependencies[id];
      if (bundled) {
        assert.strictEqual(
          bundled,
          meta.version,
          `packageDependencies.${id} should match ${meta.version}`
        );
      }
    }
    assert.ok(pinned >= 31, `pinned in-repo workspace aliases ${pinned}`);
    assert.strictEqual(
      counts.workspace,
      pinned,
      `workspace count ${counts.workspace} != pinned ${pinned}`
    );
    assert.strictEqual(
      counts['npm-builtbygio'],
      0,
      `npm-builtbygio leftovers: ${(lists['npm-builtbygio'] || []).join(', ')}`
    );
    assert.strictEqual(
      counts.file,
      0,
      `file: app deps remain: ${(lists.file || []).join(', ')}`
    );
  });
});

describe('Class C patch bridges (retired)', () => {
  it('decaffeinate / debabel sets are empty (folded into owned pins)', () => {
    assert.deepStrictEqual(DECAFFEINATE_PACKAGES, []);
    assert.deepStrictEqual(DEBABEL_PACKAGES, []);
  });

  it('offline Class C patch trees and scripts are gone', () => {
    const gone = [
      'script/lib/patch-decaffeinate-bundled-packages.js',
      'script/lib/patch-debabel-bundled-packages.js',
      'script/lib/patch-tree-view-stats.js',
      'script/lib/patch-natives-context-aware.js',
      'script/lib/patch-v8-api.js',
      'script/lib/patch-oniguruma-gyp.js',
      'script/lib/patch-spellchecker-win.js',
      'script/lib/patch-keytar-nan.js',
      'script/lib/patch-nested-nan.js',
      'script/lib/patch-github-remote.js',
      'script/lib/patch-settings-view-registry.js',
      'script/lib/patch-apm-npm.js',
      'script/lib/patch-apm-download-node.js',
      'script/lib/write-tree-view-fs-shim.js',
      'script/lib/patch-packages-remote-ipc.js',
      'script/lib/patch-dep-package-json.js',
      'script/patches/decaffeinated-bundled-packages',
      'script/patches/debabelled-bundled-packages'
    ];
    for (const rel of gone) {
      assert.ok(
        !fs.existsSync(path.join(ROOT, rel)),
        `Class C leftover still present: ${rel}`
      );
    }
  });

  it('safety-net patch files exist', () => {
    for (const name of SAFETY_NET_PATCHES) {
      const p = path.join(ROOT, 'script', 'lib', name);
      assert.ok(fs.existsSync(p), `missing ${name}`);
    }
  });
});
