'use strict';

/**
 * Fast golden tests for package-require-audit classifiers (no Electron/Jasmine).
 * Run: node --test script/ci/package-require-audit.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const {
  classifyCallerPath,
  baseModuleId,
  isNativeBindingId,
  classifyRequireId,
  isRestrictEnabled,
  isAuditEnabled,
  nativeAddonModuleIds,
  privilegedModuleIds
} = require('../../src/package-require-audit');

describe('classifyCallerPath', () => {
  it('classifies asar and resources/app as bundled', () => {
    assert.strictEqual(
      classifyCallerPath(
        '/app/resources/app.asar/node_modules/settings-view/lib/main.js'
      ),
      'bundled'
    );
    assert.strictEqual(
      classifyCallerPath('/opt/Chevron/resources/app/node_modules/x/index.js'),
      'bundled'
    );
  });

  it('classifies user package homes as community', () => {
    assert.strictEqual(
      classifyCallerPath('/home/u/.atom/packages/minimap/lib/main.js'),
      'community'
    );
    assert.strictEqual(
      classifyCallerPath('/home/u/.chevron/packages/linter/lib/main.js'),
      'community'
    );
    assert.strictEqual(
      classifyCallerPath('/Users/u/atom/packages/foo/lib/main.js'),
      'community'
    );
  });

  it('classifies monorepo packages/ as bundled (not user home)', () => {
    assert.strictEqual(
      classifyCallerPath(
        path.join('/home/u/Workspace/chevron/packages/welcome/lib/main.js')
      ),
      'bundled'
    );
  });

  it('classifies community package that lives under a path containing /packages/', () => {
    // User home wins over monorepo-style /packages/ segment.
    assert.strictEqual(
      classifyCallerPath(
        '/home/u/.atom/packages/evil/node_modules/x/index.js'
      ),
      'community'
    );
  });

  it('classifies src/static as core', () => {
    assert.strictEqual(
      classifyCallerPath('/repo/chevron/src/atom-environment.js'),
      'core'
    );
    assert.strictEqual(
      classifyCallerPath('/repo/chevron/static/preload.js'),
      'core'
    );
  });

  it('classifies bare node_modules as bundled', () => {
    assert.strictEqual(
      classifyCallerPath('/repo/chevron/node_modules/season/lib/index.js'),
      'bundled'
    );
  });

  it('returns unknown for empty / odd paths', () => {
    assert.strictEqual(classifyCallerPath(null), 'unknown');
    assert.strictEqual(classifyCallerPath(''), 'unknown');
    assert.strictEqual(classifyCallerPath('/tmp/random-file.js'), 'unknown');
  });
});

describe('classifyRequireId', () => {
  it('flags privileged and native addons', () => {
    assert.strictEqual(classifyRequireId('fs'), 'privileged');
    assert.strictEqual(classifyRequireId('fs/promises'), 'privileged');
    assert.strictEqual(classifyRequireId('child_process'), 'privileged');
    assert.strictEqual(classifyRequireId('electron'), 'privileged');
    assert.strictEqual(classifyRequireId('keytar'), 'native-addon');
    assert.strictEqual(classifyRequireId('superstring'), 'native-addon');
    assert.strictEqual(classifyRequireId('@atom/watcher'), 'native-addon');
    assert.strictEqual(classifyRequireId('./build/Release/x.node'), 'native-binding');
    assert.strictEqual(classifyRequireId('lodash'), null);
    assert.strictEqual(classifyRequireId('./relative'), null);
  });

  it('parses scoped and nested ids', () => {
    assert.strictEqual(baseModuleId('@atom/fuzzy-native'), '@atom/fuzzy-native');
    assert.strictEqual(baseModuleId('@atom/fuzzy-native/lib/x'), '@atom/fuzzy-native');
    assert.strictEqual(baseModuleId('pathwatcher/lib/main'), 'pathwatcher');
  });

  it('detects .node bindings', () => {
    assert.ok(isNativeBindingId('/tmp/foo.node'));
    assert.ok(!isNativeBindingId('keytar'));
  });
});

describe('policy defaults and inventory exports', () => {
  it('restrict defaults on; audit defaults off', () => {
    const prevA = process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
    const prevR = process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
    try {
      delete process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
      delete process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
      assert.strictEqual(isAuditEnabled(), false);
      assert.strictEqual(isRestrictEnabled(), true);
      process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = '0';
      assert.strictEqual(isRestrictEnabled(), false);
      process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = 'false';
      assert.strictEqual(isRestrictEnabled(), false);
      process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = '1';
      assert.strictEqual(isRestrictEnabled(), true);
    } finally {
      if (prevA !== undefined) process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES = prevA;
      else delete process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
      if (prevR !== undefined)
        process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = prevR;
      else delete process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
    }
  });

  it('exports non-empty privileged and native inventories', () => {
    assert.ok(privilegedModuleIds.includes('fs'));
    assert.ok(privilegedModuleIds.includes('child_process'));
    assert.ok(nativeAddonModuleIds.includes('superstring'));
    assert.ok(nativeAddonModuleIds.includes('keytar'));
  });
});
