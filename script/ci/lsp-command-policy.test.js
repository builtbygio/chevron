'use strict';

/**
 * Boundary tests for what main will spawn as a language server.
 *
 * The existing lsp-trust.test.js asserts `isTrusted()` return values. It
 * passed while the renderer could grant its own trust and pass an arbitrary
 * `command` straight through to `spawn` — the module was right, the boundary
 * was open. These tests assert the *refusal*, which is the property that
 * matters (docs/reference/lsp-design.md §6.2).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const policy = require('../../src/main-process/lsp-command-policy');

// A package registration is only accepted when an installed package declares
// that command; these stand in for the manifests on disk.
const DECLARED = {
  declaredCommands: new Map([
    ['my-langserver', 'my-pkg'],
    ['temp-server', 'temp-pkg']
  ])
};

describe('lsp command policy', () => {
  beforeEach(() => policy._reset());

  it('refuses an arbitrary binary the renderer asks for', () => {
    for (const evil of ['/bin/sh', '/usr/bin/curl', 'powershell.exe', 'node']) {
      const r = policy.checkCommand(evil, { userConfig: null });
      assert.strictEqual(r.allowed, false, `${evil} must be refused`);
      assert.ok(r.reason, 'refusal must explain why');
    }
  });

  it('refuses empty / non-string commands', () => {
    for (const bad of ['', null, undefined, 42, {}]) {
      assert.strictEqual(policy.checkCommand(bad, { userConfig: null }).allowed, false);
    }
  });

  it('allows a command the user configured themselves', () => {
    const userConfig = {
      '*': { lsp: { servers: { 'source.foo': { command: 'foo-langserver' } } } }
    };
    const r = policy.checkCommand('foo-langserver', { userConfig });
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.source, 'user-config');
  });

  it('allows a package-declared command, attributed to that package', () => {
    policy.recordRegistration({ id: 'my-pkg', command: 'my-langserver' }, DECLARED);
    const r = policy.checkCommand('my-langserver', { userConfig: null });
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.source, 'package:my-pkg');
  });

  it('stops allowing a command once its registration is withdrawn', () => {
    policy.recordRegistration({ id: 'p', command: 'temp-server' }, DECLARED);
    assert.strictEqual(policy.checkCommand('temp-server', { userConfig: null }).allowed, true);
    policy.forgetRegistration('p');
    assert.strictEqual(policy.checkCommand('temp-server', { userConfig: null }).allowed, false);
  });

  it('matches on the resolved absolute path of an allowed command', () => {
    policy.recordRegistration({ id: 'p', command: 'my-langserver' }, DECLARED);
    // the renderer resolves via PATH before starting; the basename must still match
    const r = policy.checkCommand('/usr/local/bin/my-langserver', { userConfig: null });
    assert.strictEqual(r.allowed, true);
  });

  it('does not let a lookalike path smuggle a different binary', () => {
    policy.recordRegistration({ id: 'p', command: 'my-langserver' }, DECLARED);
    const r = policy.checkCommand('/tmp/evil/my-langserver-but-not', {
      userConfig: null
    });
    assert.strictEqual(r.allowed, false);
  });

  it('ignores a caller-supplied config when none is passed (reads disk instead)', () => {
    // `checkCommand(cmd)` with no context must not be influenced by callers;
    // it consults the config file itself. Unknown commands stay refused.
    assert.strictEqual(policy.checkCommand('definitely-not-a-server').allowed, false);
  });
});

describe('a registration has to be declared on disk', () => {
  it('refuses a command no installed package declares', () => {
    assert.strictEqual(
      policy.recordRegistration({ id: 'evil', command: '/bin/sh' }, DECLARED),
      false
    );
    assert.strictEqual(
      policy.checkCommand('/bin/sh', { userConfig: null }).allowed,
      false
    );
  });

  it('refuses ids and commands that are not usable strings', () => {
    for (const reg of [
      null,
      {},
      { id: 'x' },
      { command: 'my-langserver' },
      { id: '', command: 'my-langserver' },
      { id: 'x', command: '' },
      { id: 5, command: 'my-langserver' },
      { id: 'x', command: { toString: () => 'my-langserver' } }
    ]) {
      assert.strictEqual(
        policy.recordRegistration(reg, DECLARED),
        false,
        JSON.stringify(reg)
      );
    }
  });

  it('matches the declaration by basename, not by the path given', () => {
    // The renderer resolves through PATH before registering; a different
    // binary with a similar name must not pass.
    assert.strictEqual(
      policy.recordRegistration(
        { id: 'p', command: '/usr/local/bin/my-langserver' },
        DECLARED
      ),
      true
    );
    assert.strictEqual(
      policy.recordRegistration(
        { id: 'q', command: '/tmp/my-langserver-but-not' },
        DECLARED
      ),
      false
    );
  });

  it('reads declarations from installed package manifests', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { makeTempDir, removeTempDir } = require('../lib/temp-dir');
    const home = makeTempDir('lsp-declared-');
    const pkgDir = path.join(home, 'packages', 'some-lsp');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'some-lsp',
        chevron: { languageServer: { id: 'some', command: 'some-langserver' } }
      })
    );
    const previous = process.env.CHEVRON_HOME;
    process.env.CHEVRON_HOME = home;
    try {
      const declared = policy.loadDeclaredPackageCommands({});
      assert.strictEqual(declared.get('some-langserver'), 'some-lsp');
      assert.strictEqual(declared.has('not-declared'), false);
    } finally {
      if (previous === undefined) delete process.env.CHEVRON_HOME;
      else process.env.CHEVRON_HOME = previous;
      removeTempDir(home);
    }
  });
});
