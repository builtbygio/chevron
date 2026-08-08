'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const {
  platformKey,
  rustcTarget,
  expandLsTemplate,
  pickPrebuildUrl,
  resolveLanguageServerBinary,
  ensureLanguageServerBinary,
  registrationFromPackage,
  getLanguageServerMeta
} = require('../lib/language-server-prebuild');

describe('language-server prebuild helpers', () => {
  it('platformKey and rustcTarget map hosts', () => {
    assert.strictEqual(platformKey('darwin', 'arm64'), 'darwin-arm64');
    assert.strictEqual(
      rustcTarget('linux', 'x64'),
      'x86_64-unknown-linux-gnu'
    );
    assert.strictEqual(
      rustcTarget('darwin', 'arm64'),
      'aarch64-apple-darwin'
    );
  });

  it('expandLsTemplate substitutes tag and target', () => {
    const url = expandLsTemplate(
      'https://example.com/{tag}/ra-{target}.gz',
      { tag: '2025-01-20', target: 'x86_64-unknown-linux-gnu' }
    );
    assert.strictEqual(
      url,
      'https://example.com/2025-01-20/ra-x86_64-unknown-linux-gnu.gz'
    );
  });

  it('pickPrebuildUrl selects platform key', () => {
    const ls = {
      prebuilds: {
        'linux-x64': 'https://example.com/linux.gz',
        'darwin-arm64': 'https://example.com/mac.gz'
      }
    };
    assert.strictEqual(
      pickPrebuildUrl(ls, 'linux', 'x64'),
      'https://example.com/linux.gz'
    );
    assert.strictEqual(pickPrebuildUrl(ls, 'freebsd', 'x64'), null);
  });

  it('resolveLanguageServerBinary finds bin file', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-ls-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        name: 'chevron-lsp-demo',
        version: '0.1.0',
        chevron: {
          languageServer: {
            id: 'demo',
            scopes: ['source.demo'],
            command: 'bin/demo-ls'
          }
        }
      })
    );
    fs.mkdirSync(path.join(tmp, 'bin'));
    const bin = path.join(tmp, 'bin', 'demo-ls');
    fs.writeFileSync(bin, '#!/bin/sh\n');
    fs.chmodSync(bin, 0o755);
    const resolved = resolveLanguageServerBinary(tmp);
    assert.strictEqual(resolved, bin);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('ensureLanguageServerBinary downloads gzip via fetchImpl', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-ls-dl-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        name: 'chevron-lsp-demo',
        version: '0.1.0',
        chevron: {
          languageServer: {
            id: 'demo',
            scopes: ['source.demo'],
            command: 'bin/demo-ls',
            tag: 'v1',
            prebuilds: {
              [platformKey()]: 'https://example.com/demo.gz'
            }
          }
        }
      })
    );

    const payload = zlib.gzipSync(Buffer.from('FAKE-BINARY'));
    const result = await ensureLanguageServerBinary(tmp, {
      fetchImpl: async () => ({
        ok: true,
        arrayBuffer: async () =>
          payload.buffer.slice(
            payload.byteOffset,
            payload.byteOffset + payload.byteLength
          )
      })
    });

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.strategy, 'download');
    assert.ok(fs.existsSync(result.path));
    assert.strictEqual(fs.readFileSync(result.path, 'utf8'), 'FAKE-BINARY');

    // second call is present
    const again = await ensureLanguageServerBinary(tmp, {
      fetchImpl: async () => {
        throw new Error('should not fetch');
      }
    });
    assert.strictEqual(again.strategy, 'present');

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('registrationFromPackage builds absolute command', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpm-ls-reg-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({
        name: 'chevron-lsp-demo',
        version: '0.1.0',
        chevron: {
          languageServer: {
            id: 'demo',
            scopes: ['source.demo'],
            command: 'bin/demo-ls',
            args: ['--stdio']
          }
        }
      })
    );
    fs.mkdirSync(path.join(tmp, 'bin'));
    const bin = path.join(tmp, 'bin', 'demo-ls');
    fs.writeFileSync(bin, 'x');
    const reg = registrationFromPackage(tmp);
    assert.strictEqual(reg.id, 'demo');
    assert.strictEqual(reg.command, bin);
    assert.deepStrictEqual(reg.args, ['--stdio']);
    assert.strictEqual(reg.resolved, true);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('getLanguageServerMeta returns null for normal packages', () => {
    assert.strictEqual(
      getLanguageServerMeta({ name: 'foo', version: '1.0.0' }),
      null
    );
  });
});
