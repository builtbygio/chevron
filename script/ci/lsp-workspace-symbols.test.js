'use strict';

/**
 * `workspace/symbol` — the first project-shaped context in the tree.
 *
 * Every other LSP provider starts from an editor and talks to one server.
 * This one starts from nothing and talks to all of them, which puts three
 * things at risk that a file-shaped provider never faces:
 *
 *   1. **One bad server must not cost the others their answer.** A project
 *      with four servers where one is wedged should still return symbols for
 *      the other three, not an exception in the palette.
 *   2. **The merged order has to be ours.** Servers match on their own terms
 *      and are not required to agree, so an unsorted merge reads as whichever
 *      server replied first.
 *   3. **Both result shapes.** `SymbolInformation` carries a full range;
 *      LSP 3.17's `WorkspaceSymbol` may carry nothing but a URI.
 *
 * docs/process/next-tracks-plan.md, track 3.
 * Run: node --test script/ci/lsp-workspace-symbols.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

// src/**/*.ts is transpiled at runtime by compile-cache. This test runs
// outside the app, so it does the same by hand, resolving siblings itself
// because a provider's neighbours are still .js.
function loadTs(file) {
  const compiled = typescript.compile(fs.readFileSync(file, 'utf8'), file);
  const module = { exports: {} };
  const dir = path.dirname(file);
  const localRequire = id => {
    if (!id.startsWith('.')) return require(id);
    const resolved = path.resolve(dir, id);
    return fs.existsSync(`${resolved}.ts`)
      ? loadTs(`${resolved}.ts`)
      : require(resolved);
  };
  new Function('module', 'exports', 'require', compiled)(
    module,
    module.exports,
    localRequire
  );
  return module.exports;
}

const {
  workspaceSymbols,
  normalizeWorkspaceSymbols,
  servesWorkspaceSymbols
} = loadTs(path.join(ROOT, 'src', 'lsp', 'providers', 'workspace-symbols.ts'));

const ROOT_A = path.join(path.sep, 'repo', 'a');
const URI_A = `file://${path.join(ROOT_A, 'lib', 'thing.ts')}`;

function symbolInformation(name, overrides = {}) {
  return Object.assign(
    {
      name,
      kind: 12,
      containerName: 'Thing',
      location: {
        uri: URI_A,
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 2 + name.length }
        }
      }
    },
    overrides
  );
}

/** A client whose servers answer from a fixture map. */
function clientWith(sessions, answers) {
  const asked = [];
  return {
    asked,
    listSessions: () => sessions,
    getPositionEncoding: () => 'utf-16',
    async request(serverId, method, params) {
      asked.push({ serverId, method, query: params.query });
      const answer = answers[serverId];
      if (typeof answer === 'function') return answer();
      return { result: answer };
    }
  };
}

const CAPABLE = { serverId: 'ts', projectRoot: ROOT_A, capabilities: { workspaceSymbolProvider: true } };

describe('capability', () => {
  it('accepts both shapes the protocol allows for a yes', () => {
    assert.strictEqual(servesWorkspaceSymbols(CAPABLE), true);
    assert.strictEqual(
      servesWorkspaceSymbols({
        serverId: 'x',
        capabilities: { workspaceSymbolProvider: { resolveProvider: true } }
      }),
      true,
      'an options object is as much a yes as true is'
    );
  });

  it('treats anything else as no', () => {
    assert.strictEqual(servesWorkspaceSymbols(null), false);
    assert.strictEqual(servesWorkspaceSymbols({ serverId: 'x' }), false);
    assert.strictEqual(
      servesWorkspaceSymbols({ serverId: 'x', capabilities: {} }),
      false
    );
    assert.strictEqual(
      servesWorkspaceSymbols({
        serverId: 'x',
        capabilities: { workspaceSymbolProvider: false }
      }),
      false
    );
  });
});

describe('normalize', () => {
  it('reads a SymbolInformation, range and all', () => {
    const [symbol] = normalizeWorkspaceSymbols(
      [symbolInformation('parseThing')],
      CAPABLE
    );
    assert.strictEqual(symbol.name, 'parseThing');
    assert.strictEqual(symbol.kindName, 'Function');
    assert.strictEqual(symbol.containerName, 'Thing');
    assert.strictEqual(symbol.path, path.join(ROOT_A, 'lib', 'thing.ts'));
    assert.deepStrictEqual(symbol.range.start, { row: 4, column: 2 });
    assert.strictEqual(symbol.serverId, 'ts');
    assert.strictEqual(symbol.projectRoot, ROOT_A);
  });

  it('keeps a 3.17 WorkspaceSymbol that has only a URI, with a null range', () => {
    const [symbol] = normalizeWorkspaceSymbols(
      [{ name: 'lazy', kind: 5, location: { uri: URI_A } }],
      CAPABLE
    );
    assert.strictEqual(symbol.name, 'lazy');
    assert.strictEqual(symbol.kindName, 'Class');
    assert.strictEqual(
      symbol.range,
      null,
      'a symbol that names a file but not a line says so, rather than guessing row 0'
    );
    assert.strictEqual(symbol.path, path.join(ROOT_A, 'lib', 'thing.ts'));
  });

  it('drops entries that are not symbols', () => {
    const symbols = normalizeWorkspaceSymbols(
      [null, {}, { name: 'no-location' }, { location: { uri: URI_A } }, 'nope'],
      CAPABLE
    );
    assert.deepStrictEqual(symbols, []);
  });

  it('returns nothing for a non-array result', () => {
    assert.deepStrictEqual(normalizeWorkspaceSymbols(null, CAPABLE), []);
    assert.deepStrictEqual(normalizeWorkspaceSymbols({ x: 1 }, CAPABLE), []);
  });
});

describe('fan-out', () => {
  it('asks every capable server and merges what comes back', async () => {
    const client = clientWith(
      [
        CAPABLE,
        { serverId: 'py', projectRoot: ROOT_A, capabilities: { workspaceSymbolProvider: true } }
      ],
      {
        ts: [symbolInformation('parseThing')],
        py: [
          symbolInformation('parse_thing', {
            location: {
              uri: `file://${path.join(ROOT_A, 'thing.py')}`,
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 11 }
              }
            }
          })
        ]
      }
    );

    const symbols = await workspaceSymbols(client, 'parse');
    assert.strictEqual(symbols.length, 2);
    assert.deepStrictEqual(
      symbols.map(s => s.serverId).sort(),
      ['py', 'ts']
    );
    assert.deepStrictEqual(client.asked.map(a => a.method), [
      'workspace/symbol',
      'workspace/symbol'
    ]);
  });

  it('does not ask a server that cannot answer', async () => {
    const client = clientWith(
      [CAPABLE, { serverId: 'json', projectRoot: ROOT_A, capabilities: {} }],
      { ts: [symbolInformation('parseThing')] }
    );
    await workspaceSymbols(client, 'parse');
    assert.deepStrictEqual(client.asked.map(a => a.serverId), ['ts']);
  });

  it('keeps the other servers when one fails', async () => {
    const client = clientWith(
      [
        CAPABLE,
        { serverId: 'wedged', projectRoot: ROOT_A, capabilities: { workspaceSymbolProvider: true } }
      ],
      {
        ts: [symbolInformation('parseThing')],
        wedged: () => Promise.reject(new Error('server died'))
      }
    );

    const symbols = await workspaceSymbols(client, 'parse');
    assert.strictEqual(symbols.length, 1, 'one broken server is not a broken query');
    assert.strictEqual(symbols[0].serverId, 'ts');
  });

  it('treats an error response as no answer', async () => {
    const client = clientWith([CAPABLE], {
      ts: undefined
    });
    client.request = async () => ({ error: { code: -32601, message: 'unsupported' } });
    assert.deepStrictEqual(await workspaceSymbols(client, 'parse'), []);
  });

  it('asks nobody when no server is capable', async () => {
    const client = clientWith(
      [{ serverId: 'json', projectRoot: ROOT_A, capabilities: {} }],
      {}
    );
    assert.deepStrictEqual(await workspaceSymbols(client, 'parse'), []);
    assert.deepStrictEqual(client.asked, []);
  });

  it('asks only the servers for the root it was given', async () => {
    const client = clientWith(
      [
        CAPABLE,
        {
          serverId: 'other',
          projectRoot: path.join(path.sep, 'repo', 'other'),
          capabilities: { workspaceSymbolProvider: true }
        }
      ],
      { ts: [symbolInformation('parseThing')], other: [symbolInformation('parseOther')] }
    );

    const symbols = await workspaceSymbols(client, 'parse', { root: ROOT_A });
    assert.deepStrictEqual(client.asked.map(a => a.serverId), ['ts']);
    assert.strictEqual(symbols.length, 1);
  });
});

describe('merged order', () => {
  const client = () =>
    clientWith([CAPABLE], {
      ts: [
        symbolInformation('unrelated'),
        symbolInformation('parseThingCarefully'),
        symbolInformation('reparse'),
        symbolInformation('parse'),
        symbolInformation('parseIt')
      ]
    });

  it('puts an exact match first, then prefixes, then substrings', async () => {
    const symbols = await workspaceSymbols(client(), 'parse');
    assert.deepStrictEqual(symbols.map(s => s.name), [
      'parse',
      'parseIt',
      'parseThingCarefully',
      'reparse',
      'unrelated'
    ]);
  });

  it('is case-insensitive about it', async () => {
    const symbols = await workspaceSymbols(client(), 'PARSE');
    assert.strictEqual(symbols[0].name, 'parse');
  });

  it('drops a symbol two servers both reported', async () => {
    const duplicate = symbolInformation('parseThing');
    const both = clientWith(
      [
        CAPABLE,
        { serverId: 'py', projectRoot: ROOT_A, capabilities: { workspaceSymbolProvider: true } }
      ],
      { ts: [duplicate], py: [duplicate] }
    );
    const symbols = await workspaceSymbols(both, 'parse');
    assert.strictEqual(symbols.length, 1);
  });

  it('honours a limit', async () => {
    const symbols = await workspaceSymbols(client(), 'parse', { limit: 2 });
    assert.deepStrictEqual(symbols.map(s => s.name), ['parse', 'parseIt']);
  });
});

describe('the wiring', () => {
  // The client capability itself is gated over the wire, in
  // lsp-host-integration.test.js: a string in a source file is not proof
  // that initialize carried it.
  it('is reachable as chevron.lsp.projectSymbols', () => {
    const index = fs.readFileSync(
      path.join(ROOT, 'src', 'lsp', 'index.js'),
      'utf8'
    );
    assert.match(index, /async function projectSymbols\(/);
    assert.match(index, /^\s{2}projectSymbols,$/m, 'and exported');
    assert.match(index, /function listSessions\(/);
  });
});
