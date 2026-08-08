'use strict';

/**
 * Phase 3 registry + signature/references unit tests.
 * Run: node --test script/ci/lsp-registry.test.js
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');
const {
  registerServer,
  resolveRegistration,
  listRegistrations,
  matchesScope,
  normalizePackageSpec,
  _clearPackageRegistrations
} = require('../../src/lsp/registry');
const {
  normalizeSignatureHelp,
  formatSignatureHelp
} = require('../../src/lsp/providers/signature-help');
const { referencesAt } = require('../../src/lsp/providers/references');
const { pointToLspWithEncoding } = require('../../src/lsp/position');

describe('registry', () => {
  beforeEach(() => _clearPackageRegistrations());
  afterEach(() => _clearPackageRegistrations());

  it('normalizePackageSpec requires id, scopes, command', () => {
    assert.throws(() => normalizePackageSpec({}), /id/);
    assert.throws(() => normalizePackageSpec({ id: 'x' }), /scopes/);
    assert.throws(
      () => normalizePackageSpec({ id: 'x', scopes: ['source.rust'] }),
      /command/
    );
  });

  it('package registration takes precedence over builtin', () => {
    // Even if builtin would match, package wins
    const d = registerServer({
      id: 'custom-ts',
      scopes: ['source.ts'],
      command: '/opt/custom-tsserver',
      args: ['--stdio']
    });
    const reg = resolveRegistration('source.ts', {});
    assert.ok(reg);
    assert.strictEqual(reg.id, 'custom-ts');
    assert.strictEqual(reg.source, 'package');
    assert.strictEqual(reg.command, '/opt/custom-tsserver');
    d.dispose();
    // After dispose, package entry gone (may fall through to builtin if on PATH)
    const after = resolveRegistration('source.ts', {});
    if (after) assert.notStrictEqual(after.id, 'custom-ts');
  });

  it('matchesScope supports prefix', () => {
    const reg = { scopes: ['source.js'] };
    assert.ok(matchesScope(reg, 'source.js'));
    assert.ok(matchesScope(reg, 'source.js.jsx'));
    assert.ok(!matchesScope(reg, 'source.ts'));
  });

  it('listRegistrations includes package entries', () => {
    registerServer({
      id: 'demo',
      scopes: ['source.demo'],
      command: 'demo-ls'
    });
    const list = listRegistrations({});
    assert.ok(list.some(r => r.id === 'demo' && r.source === 'package'));
  });
});

describe('signature help normalize', () => {
  it('formats active parameter with string label', () => {
    const help = normalizeSignatureHelp({
      signatures: [
        {
          label: 'foo(a: number, b: string)',
          parameters: [{ label: 'a: number' }, { label: 'b: string' }]
        }
      ],
      activeSignature: 0,
      activeParameter: 1
    });
    assert.ok(help);
    const text = formatSignatureHelp(help);
    assert.ok(text.includes('«b: string»'));
  });

  it('returns null for empty', () => {
    assert.strictEqual(normalizeSignatureHelp(null), null);
    assert.strictEqual(normalizeSignatureHelp({ signatures: [] }), null);
  });
});

describe('references + utf-8 position', () => {
  it('referencesAt sends request with encoding-aware position', async () => {
    let seen;
    const client = {
      getServerIdForEditor: () => 'rust:root',
      getPositionEncoding: () => 'utf-8',
      request: async (id, method, params) => {
        seen = { id, method, params };
        return {
          result: [
            {
              uri: 'file:///tmp/a.rs',
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 3 }
              }
            }
          ]
        };
      }
    };
    const editor = {
      getPath: () => '/tmp/a.rs',
      getCursorBufferPosition: () => ({ row: 0, column: 2 }),
      lineTextForBufferRow: () => '🎉x' // emoji then x: col 2 is after emoji in utf-16
    };
    const locs = await referencesAt(client, editor);
    assert.strictEqual(locs.length, 1);
    assert.strictEqual(seen.method, 'textDocument/references');
    // utf-8 byte offset for column 2 on '🎉x' (🎉 is 4 utf-8 bytes, 2 utf-16 units)
    const expected = pointToLspWithEncoding('🎉x', { row: 0, column: 2 }, 'utf-8');
    assert.deepStrictEqual(seen.params.position, expected);
  });
});
