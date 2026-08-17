'use strict';

/**
 * Epic 21 slice 21.4 — hybrid routing: which packages may run in the host.
 * Run: node --test script/ci/package-host-eligibility.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  classifyPackage,
  shouldActivateInHost,
  isHostEnabled
} = require('../../src/package-host-eligibility');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(ROOT, 'spec/fixtures/packages');

/**
 * The real classifier keys trust tier off the package's path (community means
 * under ~/.chevron/packages). Fixtures live in the repo, so tests either
 * declare intent explicitly or lay a package out under a fake community root.
 */
function communityPackage(name, files, metadata = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'chevron-host-elig-'));
  const root = path.join(home, '.chevron', 'packages', name);
  fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify(Object.assign({ name, version: '1.0.0', main: './lib/main' }, metadata))
  );
  for (const [rel, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, rel), source);
  }
  return root;
}

describe('package host v2 — eligibility (21.4)', () => {
  it('treats a logic-only community package as host-eligible', () => {
    const root = communityPackage('logic-pkg', {
      'lib/main.js': `
        const {CompositeDisposable} = require('chevron');
        module.exports = {
          activate() {
            this.subs = new CompositeDisposable();
            chevronNoop();
          },
          deactivate() {}
        };
        function chevronNoop() {}
      `
    });
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.reason, 'logic-only');
    assert.strictEqual(res.tier, 'community');
  });

  it('refuses a package that builds DOM', () => {
    const root = communityPackage('dom-pkg', {
      'lib/main.js': `
        module.exports = {
          activate() { this.el = document.createElement('div'); }
        };
      `
    });
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, false);
    assert.match(res.reason, /needs the editor DOM/);
    assert.ok(res.signals.includes('document'));
  });

  it('detects DOM use in a file other than main', () => {
    const root = communityPackage('deep-dom-pkg', {
      'lib/main.js': `module.exports = { activate() { require('./view'); } };`,
      'lib/view.js': `const etch = require('etch'); module.exports = etch;`
    });
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.signals.includes('etch'));
  });

  it('flags workspace panel and view-registry use', () => {
    const root = communityPackage('panel-pkg', {
      'lib/main.js': `
        module.exports = {
          activate() { chevron.workspace.addModalPanel({item: this.thing}); }
        };
      `
    });
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.signals.includes('workspace-panel'));
  });

  it('keeps a package needing privileged Node in-process', () => {
    const root = communityPackage('fs-pkg', {
      'lib/main.js': `
        const fs = require('fs');
        module.exports = { activate() { this.x = fs; } };
      `
    });
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, false);
    assert.match(res.reason, /privileged module "fs"/);
  });

  it('lets package.json opt out explicitly', () => {
    const root = communityPackage(
      'opt-out-pkg',
      { 'lib/main.js': `module.exports = {activate(){}};` },
      { chevronPackageHost: 'editor' }
    );
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, false);
    assert.strictEqual(res.explicit, true);
    assert.match(res.reason, /opts out/);
  });

  it('lets package.json opt in explicitly, overriding the tier check', () => {
    const res = classifyPackage({
      packagePath: path.join(FIXTURES, 'package-host-logic-only'),
      metadata: JSON.parse(
        fs.readFileSync(
          path.join(FIXTURES, 'package-host-logic-only', 'package.json'),
          'utf8'
        )
      )
    });
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.explicit, true);
    assert.match(res.reason, /opts in/);
  });

  it('keeps bundled and core packages in-process by default', () => {
    const res = classifyPackage({
      packagePath: path.join(FIXTURES, 'package-host-ui'),
      metadata: { name: 'package-host-ui' }
    });
    assert.strictEqual(res.eligible, false);
    assert.match(res.reason, /not a community package/);
  });

  it('refuses the UI fixture even when treated as community', () => {
    const uiSource = fs.readFileSync(
      path.join(FIXTURES, 'package-host-ui', 'lib', 'main.js'),
      'utf8'
    );
    const root = communityPackage('ui-pkg', { 'lib/main.js': uiSource });
    const res = classifyPackage({ packagePath: root });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.signals.includes('document'));
  });
});

describe('package host v2 — routing gate (21.4)', () => {
  const logicOnly = {
    packagePath: path.join(FIXTURES, 'package-host-logic-only'),
    metadata: { name: 'package-host-logic-only', chevronPackageHost: 'eligible' }
  };

  it('routes nothing to the host while the flag is off', () => {
    const res = shouldActivateInHost(Object.assign({ hostEnabled: false }, logicOnly));
    assert.strictEqual(res.inHost, false);
    assert.match(res.reason, /disabled/);
    assert.strictEqual(res.classification, null);
  });

  it('routes an eligible package once the flag is on', () => {
    const res = shouldActivateInHost(Object.assign({ hostEnabled: true }, logicOnly));
    assert.strictEqual(res.inHost, true);
  });

  it('reads the flag from env, then config, defaulting off', () => {
    const previous = process.env.CHEVRON_PACKAGE_HOST_V2;
    try {
      delete process.env.CHEVRON_PACKAGE_HOST_V2;
      assert.strictEqual(isHostEnabled(null), false);
      assert.strictEqual(isHostEnabled({ get: () => true }), true);
      assert.strictEqual(isHostEnabled({ get: () => false }), false);

      process.env.CHEVRON_PACKAGE_HOST_V2 = '1';
      assert.strictEqual(isHostEnabled({ get: () => false }), true);

      process.env.CHEVRON_PACKAGE_HOST_V2 = '0';
      assert.strictEqual(isHostEnabled({ get: () => true }), false);
    } finally {
      if (previous === undefined) delete process.env.CHEVRON_PACKAGE_HOST_V2;
      else process.env.CHEVRON_PACKAGE_HOST_V2 = previous;
    }
  });
});
