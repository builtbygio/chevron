'use strict';

/**
 * PackageManager routes eligible community packages to the host (Epic 21).
 * Run: node --test script/ci/package-host-routing.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const client = require('../../src/package-host-client.ts');
const {
  shouldActivateInHost
} = require('../../src/package-host-eligibility.ts');

describe('package-host-client contributions', () => {
  it('registers selector commands that dispatch to the host', () => {
    const added = [];
    const dispatched = [];
    const pack = {
      name: 'logic-only',
      activationDisposables: { add(d) { added.push(d); } }
    };
    const disposable = client.applyContribution(
      {
        dispatch(name, command, detail) {
          dispatched.push({ name, command, detail });
          return Promise.resolve({ dispatched: true });
        },
        commandRegistry: {
          add(target, name, cb) {
            assert.strictEqual(target, 'atom-workspace');
            assert.strictEqual(name, 'logic-only:greet');
            cb({ detail: { n: 1 } });
            return { dispose() {} };
          }
        }
      },
      pack,
      { kind: 'commands.add', target: 'atom-workspace', name: 'logic-only:greet' }
    );
    assert.ok(disposable);
    assert.strictEqual(added.length, 1);
    assert.deepStrictEqual(dispatched, [
      { name: 'logic-only', command: 'logic-only:greet', detail: { n: 1 } }
    ]);
  });

  it('forwards notifications and config.set', () => {
    const notes = [];
    const sets = [];
    const pack = { name: 'logic-only' };
    client.applyContribution(
      {
        notificationManager: {
          addInfo(message, options) {
            notes.push({ message, options });
          }
        },
        config: {
          set(keyPath, value) {
            sets.push({ keyPath, value });
          }
        }
      },
      pack,
      { kind: 'notifications.add', level: 'info', message: 'hi', options: { x: 1 } }
    );
    client.applyContribution(
      { config: { set(keyPath, value) { sets.push({ keyPath, value }); } } },
      pack,
      { kind: 'config.set', keyPath: 'logic-only.greeting', value: 'yo' }
    );
    assert.deepStrictEqual(notes, [{ message: 'hi', options: { x: 1 } }]);
    assert.deepStrictEqual(sets, [
      { keyPath: 'logic-only.greeting', value: 'yo' }
    ]);
  });

  it('snapshots config settings plus project paths', () => {
    const snap = client.configSnapshot(
      { settings: { core: { packageHostV2: true } } },
      ['/tmp/proj']
    );
    assert.strictEqual(snap.core.packageHostV2, true);
    assert.deepStrictEqual(snap.__projectPaths, ['/tmp/proj']);
    snap.core.packageHostV2 = false;
    assert.strictEqual(
      client.configSnapshot({ settings: { core: { packageHostV2: true } } }, [])
        .core.packageHostV2,
      true
    );
  });
});

describe('PackageManager host routing source', () => {
  const managerSrc = fs.readFileSync(
    path.join(ROOT, 'src/package-manager.js'),
    'utf8'
  );
  const packageSrc = fs.readFileSync(path.join(ROOT, 'src/package.js'), 'utf8');

  it('PackageManager calls the host client for eligible packages', () => {
    assert.match(managerSrc, /completeHostActivation/);
    assert.match(managerSrc, /packageShouldActivateInHost/);
    assert.match(managerSrc, /package-host-client/);
    assert.match(managerSrc, /deactivatePackage\(pack\.name\)/);
  });

  it('Package skips requiring main when hosted', () => {
    assert.match(packageSrc, /isHostedActivation/);
    assert.match(packageSrc, /this\.hostActivation = true/);
  });

  it('eligible logic-only packages still classify as inHost when enabled', () => {
    const res = shouldActivateInHost({
      packagePath: path.join(
        ROOT,
        'spec/fixtures/packages/package-host-logic-only'
      ),
      metadata: {
        name: 'package-host-logic-only',
        chevronPackageHost: 'eligible'
      },
      hostEnabled: true
    });
    assert.strictEqual(res.inHost, true);
  });
});
