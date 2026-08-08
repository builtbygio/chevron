'use strict';

/**
 * Boundary tests for what main will spawn as a language server.
 *
 * The existing lsp-trust.test.js asserts `isTrusted()` return values. It
 * passed while the renderer could grant its own trust and pass an arbitrary
 * `command` straight through to `spawn` — the module was right, the boundary
 * was open. These tests assert the *refusal*, which is the property that
 * matters (docs/lsp-design.md §6.2).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const policy = require('../../src/main-process/lsp-command-policy');

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
    policy.recordRegistration({ id: 'my-pkg', command: 'my-langserver' });
    const r = policy.checkCommand('my-langserver', { userConfig: null });
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.source, 'package:my-pkg');
  });

  it('stops allowing a command once its registration is withdrawn', () => {
    policy.recordRegistration({ id: 'p', command: 'temp-server' });
    assert.strictEqual(policy.checkCommand('temp-server', { userConfig: null }).allowed, true);
    policy.forgetRegistration('p');
    assert.strictEqual(policy.checkCommand('temp-server', { userConfig: null }).allowed, false);
  });

  it('matches on the resolved absolute path of an allowed command', () => {
    policy.recordRegistration({ id: 'p', command: 'my-langserver' });
    // the renderer resolves via PATH before starting; the basename must still match
    const r = policy.checkCommand('/usr/local/bin/my-langserver', { userConfig: null });
    assert.strictEqual(r.allowed, true);
  });

  it('does not let a lookalike path smuggle a different binary', () => {
    policy.recordRegistration({ id: 'p', command: 'my-langserver' });
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
