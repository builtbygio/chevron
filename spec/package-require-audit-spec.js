'use strict';

const path = require('path');
const {
  classifyCallerPath,
  baseModuleId,
  isAuditEnabled,
  isRestrictEnabled,
  isNativeBindingId,
  classifyRequireId,
  nativeAddonModuleIds
} = require('../src/package-require-audit');

describe('package-require-audit / N3.2 + S1.0 classifyCallerPath', function() {
  it('classifies asar paths as bundled', function() {
    expect(
      classifyCallerPath(
        '/app/out/Chevron-linux-x64/resources/app.asar/node_modules/settings-view/lib/main.js'
      )
    ).toBe('bundled');
  });

  it('classifies resources/app paths as bundled', function() {
    expect(
      classifyCallerPath(
        '/home/user/chevron/out/app/node_modules/tree-view/lib/main.js'
      )
    ).toBe('bundled');
  });

  it('classifies ~/.atom/packages as community', function() {
    expect(
      classifyCallerPath(
        '/home/user/.atom/packages/minimap/lib/minimap.js'
      )
    ).toBe('community');
  });

  it('classifies ~/.chevron/packages as community', function() {
    expect(
      classifyCallerPath(
        '/home/user/.chevron/packages/linter/lib/main.js'
      )
    ).toBe('community');
  });

  it('classifies monorepo packages/ as bundled', function() {
    expect(
      classifyCallerPath(
        path.join(
          '/home/user/Workspace/chevron/packages/welcome/lib/main.js'
        )
      )
    ).toBe('bundled');
  });

  it('classifies src as core', function() {
    expect(
      classifyCallerPath('/home/user/Workspace/chevron/src/atom-environment.js')
    ).toBe('core');
  });

  it('parses base module ids', function() {
    expect(baseModuleId('fs')).toBe('fs');
    expect(baseModuleId('fs/promises')).toBe('fs');
    expect(baseModuleId('@atom/watcher')).toBe('@atom/watcher');
    expect(baseModuleId('./relative')).toBe(null);
  });

  it('detects native binding require ids', function() {
    expect(isNativeBindingId('./build/Release/tree_sitter.node')).toBe(true);
    expect(isNativeBindingId('/tmp/foo.node')).toBe(true);
    expect(isNativeBindingId('keytar')).toBe(false);
    expect(isNativeBindingId('./index.js')).toBe(false);
  });

  it('classifies require ids for policy', function() {
    expect(classifyRequireId('fs')).toBe('privileged');
    expect(classifyRequireId('child_process')).toBe('privileged');
    expect(classifyRequireId('keytar')).toBe('native-addon');
    expect(classifyRequireId('superstring')).toBe('native-addon');
    expect(classifyRequireId('@atom/fuzzy-native')).toBe('native-addon');
    expect(classifyRequireId('./x.node')).toBe('native-binding');
    expect(classifyRequireId('lodash')).toBe(null);
  });

  it('exports native addon module ids from inventory', function() {
    expect(nativeAddonModuleIds).toContain('superstring');
    expect(nativeAddonModuleIds).toContain('keytar');
    expect(nativeAddonModuleIds).toContain('@atom/watcher');
  });

  it('audit defaults off; restrict defaults on (P1.2)', function() {
    const prevA = process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
    const prevR = process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
    delete process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
    delete process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
    expect(isAuditEnabled()).toBe(false);
    expect(isRestrictEnabled()).toBe(true);
    process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = '0';
    expect(isRestrictEnabled()).toBe(false);
    process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = '1';
    expect(isRestrictEnabled()).toBe(true);
    if (prevA !== undefined) process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES = prevA;
    else delete process.env.CHEVRON_AUDIT_PACKAGE_REQUIRES;
    if (prevR !== undefined)
      process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES = prevR;
    else delete process.env.CHEVRON_RESTRICT_PACKAGE_REQUIRES;
  });
});
