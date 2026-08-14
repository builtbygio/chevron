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

describe('official tree-sitter 0.25 is not overwritten', () => {
  it('bootstrap does not force-copy packages/tree-sitter (DeeDeeG 0.17)', () => {
    const sh = fs.readFileSync(
      path.join(__dirname, '../lib/force-patched-superstring.sh'),
      'utf8'
    );
    assert.ok(
      !/chevron_force_one_native[^\n]*packages\/tree-sitter/.test(sh),
      'force-copying packages/tree-sitter overwrites npm tree-sitter@0.25'
    );
    assert.ok(sh.includes('Official npm tree-sitter@0.25'));
  });
});

describe('critical-natives', () => {
  it('lists core packages', () => {
    assert.ok(CRITICAL_REBUILD_PACKAGES.includes('superstring'));
    assert.ok(CRITICAL_REBUILD_PACKAGES.includes('keytar'));
    assert.ok(CRITICAL_REBUILD_PACKAGES.includes('keyboard-layout'));
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

describe('patch matrix doc exists', () => {
  it('docs/bootstrap-patch-matrix.md is present', () => {
    const p = path.join(__dirname, '..', '..', 'docs', 'bootstrap-patch-matrix.md');
    assert.ok(fs.existsSync(p));
    const text = fs.readFileSync(p, 'utf8');
    assert.ok(text.includes('patch-v8-api'));
    assert.ok(text.includes('critical-natives'));
  });
});
