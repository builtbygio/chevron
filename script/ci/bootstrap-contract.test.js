'use strict';

/**
 * Stream A: bootstrap contract unit tests (no full native rebuild).
 * Run: node --test script/ci/bootstrap-contract.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const verify = require('../lib/verify-machine-requirements');
const {
  parsePythonVersion,
  isAcceptablePython,
  NODE_MIN_MAJOR,
  NODE_MAX_MAJOR
} = verify._test;

const {
  CRITICAL_REBUILD_PACKAGES,
  findArtifact,
  checkCriticalNatives,
  allowNativeFailures
} = require('../lib/critical-natives');

describe('verify-machine-requirements policy', () => {
  it('documents Node 20–24 range', () => {
    assert.strictEqual(NODE_MIN_MAJOR, 20);
    assert.strictEqual(NODE_MAX_MAJOR, 24);
  });

  it('parsePythonVersion handles plain and rc versions', () => {
    assert.deepStrictEqual(parsePythonVersion('3.12.3'), {
      major: 3,
      minor: 12,
      full: '3.12.3'
    });
    assert.strictEqual(parsePythonVersion('3.12.0rc1').minor, 12);
  });

  it('accepts Python 3.11–3.13 only', () => {
    assert.ok(isAcceptablePython({ major: 3, minor: 11 }));
    assert.ok(isAcceptablePython({ major: 3, minor: 12 }));
    assert.ok(isAcceptablePython({ major: 3, minor: 13 }));
    assert.ok(!isAcceptablePython({ major: 3, minor: 10 }));
    assert.ok(!isAcceptablePython({ major: 3, minor: 14 }));
    assert.ok(!isAcceptablePython({ major: 2, minor: 7 }));
  });
});

describe('compile patches folded into owned native forks', () => {
  it('bootstrap-modern does not run retired native compile patches', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../bootstrap-modern'),
      'utf8'
    );
    for (const name of [
      'patch-natives-context-aware',
      'patch-v8-api',
      'patch-oniguruma-gyp',
      'patch-spellchecker-win',
      'patch-keytar-nan',
      'patch-nested-nan',
      'patch-github-remote',
      'patch-settings-view-registry',
      'patch-apm-npm',
      'patch-apm-download-node',
      'patch-packages-remote-ipc',
      'patch-dep-package-json'
    ]) {
      assert.ok(
        !text.includes(name),
        `bootstrap-modern still calls retired ${name}`
      );
    }
  });
});

describe('official tree-sitter 0.25 is not overwritten', () => {
  it('does not vendor DeeDeeG packages/tree-sitter', () => {
    assert.ok(
      !fs.existsSync(path.join(__dirname, '../../packages/tree-sitter')),
      'packages/tree-sitter is the old DeeDeeG 0.17 tree; runtime is npm 0.25.1'
    );
  });

  it('bootstrap does not force-copy a vendored tree-sitter', () => {
    const sh = fs.readFileSync(
      path.join(__dirname, '../lib/force-patched-superstring.sh'),
      'utf8'
    );
    assert.ok(
      !/chevron_force_one_native[^\n]*packages\/tree-sitter/.test(sh),
      'force-copying packages/tree-sitter overwrites npm tree-sitter@0.25'
    );
    assert.ok(!CRITICAL_REBUILD_PACKAGES.includes('tree-sitter'));
  });

  it('force-copy excludes local build/ (host ABI)', () => {
    const sh = fs.readFileSync(
      path.join(__dirname, '../lib/force-patched-superstring.sh'),
      'utf8'
    );
    assert.ok(
      /rsync -a --exclude node_modules --exclude package-lock.json --exclude build/.test(
        sh
      ),
      'rsync must exclude packages/*/build so a host-Node .node is not copied'
    );
  });

  it('link-package-natives-to-root does not copy tree-sitter', () => {
    const js = fs.readFileSync(
      path.join(__dirname, '../lib/link-package-natives-to-root.js'),
      'utf8'
    );
    assert.ok(
      !/['"]tree-sitter['"]/.test(js),
      'copying root tree-sitter over a nested copy reintroduces the 0.25 overwrite'
    );
  });

  it('bootstrap-modern force-copies natives only when rebuilding', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '../bootstrap-modern'),
      'utf8'
    );
    const skipIdx = text.indexOf('SKIP_NATIVE_REBUILD=false');
    const copyIdx = text.indexOf('chevron_force_patched_superstring');
    assert.ok(skipIdx > 0 && copyIdx > skipIdx, 'force-copy must run after skip decision');
    assert.ok(
      /if \[ "\$SKIP_NATIVE_REBUILD" = false \]; then[\s\S]*chevron_force_patched_superstring/.test(
        text
      ),
      'warm-cache skip must not wipe Electron-built superstring/watcher'
    );
  });
});

describe('critical-natives', () => {
  it('lists core packages', () => {
    assert.ok(CRITICAL_REBUILD_PACKAGES.includes('superstring'));
    assert.ok(CRITICAL_REBUILD_PACKAGES.includes('keytar'));
    assert.ok(CRITICAL_REBUILD_PACKAGES.includes('keyboard-layout'));
    assert.ok(
      CRITICAL_REBUILD_PACKAGES.includes('@derekstride/tree-sitter-sql'),
      'SQL tree-sitter addon has no npm prebuilds'
    );
    assert.ok(
      CRITICAL_REBUILD_PACKAGES.includes('tree-sitter-less'),
      'Less tree-sitter addon has no npm prebuilds'
    );
  });

  it('findArtifact reports missing package', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-nat-'));
    const r = findArtifact(tmp, 'superstring');
    assert.strictEqual(r.present, false);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('findArtifact finds a planted .node', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-nat-'));
    const release = path.join(
      tmp,
      'node_modules',
      'superstring',
      'build',
      'Release'
    );
    fs.mkdirSync(release, { recursive: true });
    const nodePath = path.join(release, 'superstring.node');
    fs.writeFileSync(nodePath, '');
    const r = findArtifact(tmp, 'superstring');
    assert.strictEqual(r.present, true);
    assert.strictEqual(r.path, nodePath);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('checkCriticalNatives aggregates missing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crit-all-'));
    const result = checkCriticalNatives(tmp);
    assert.strictEqual(result.ok, false);
    assert.ok(result.missing.length >= CRITICAL_REBUILD_PACKAGES.length - 1);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('allowNativeFailures reads env', () => {
    const prev = process.env.CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES;
    process.env.CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES = '1';
    assert.strictEqual(allowNativeFailures(), true);
    process.env.CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES = '0';
    assert.strictEqual(allowNativeFailures(), false);
    if (prev === undefined) delete process.env.CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES;
    else process.env.CHEVRON_ALLOW_NATIVE_REBUILD_FAILURES = prev;
  });
});

describe('github atomTranspilers folded', () => {
  it('no bundled package still declares atomTranspilers', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
    );
    const hits = [];
    for (const name of Object.keys(pkg.packageDependencies || {})) {
      const metaPath = path.join(
        __dirname,
        '../../node_modules',
        name,
        'package.json'
      );
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (meta.atomTranspilers) hits.push(name);
    }
    assert.deepStrictEqual(
      hits,
      [],
      `atomTranspilers still present: ${hits.join(', ')}`
    );
  });
});

describe('script/build does not call the dead bootstrap stub', () => {
  it('fails closed on a cold tree and skips when already bootstrapped', () => {
    const text = fs.readFileSync(path.join(__dirname, '../build'), 'utf8');
    assert.ok(
      !/require\('\.\/bootstrap'\)/.test(text),
      './script/build must not require the legacy bootstrap stub'
    );
    assert.ok(text.includes('bootstrap-modern'));
    assert.ok(text.includes('already bootstrapped'));
  });
});

describe('patch matrix doc exists', () => {
  it('docs/bootstrap-patch-matrix.md is present', () => {
    const p = path.join(__dirname, '..', '..', 'docs', 'bootstrap-patch-matrix.md');
    assert.ok(fs.existsSync(p));
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(text.includes('critical-natives'));
    assert.ok(text.includes('force-patched-superstring'));
  });
});
