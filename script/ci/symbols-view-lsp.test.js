'use strict';

/**
 * Turning LSP workspace symbols into rows symbols-view can open.
 *
 * A ctags tag is `{name, file, directory, position}` with `file` relative to
 * `directory`, and `openTag` joins the two. An LSP symbol is an absolute path
 * and nothing else. Getting that conversion wrong does not throw — it opens
 * the wrong file, or a file that does not exist, which is why the awkward
 * cases (a nested root, a symbol outside every root, a symbol with no range)
 * are pinned here rather than left to the view.
 *
 * docs/process/next-tracks-plan.md, track 3.
 * Run: node --test script/ci/symbols-view-lsp.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');

const {
  itemsForSymbols,
  itemForSymbol,
  rootFor,
  lspServesProjectSymbols
} = require('../../packages/symbols-view/lib/lsp-symbols');

const ROOT_A = path.join(path.sep, 'repo', 'a');
const NESTED = path.join(ROOT_A, 'packages', 'inner');

function symbol(overrides = {}) {
  return Object.assign(
    {
      name: 'parseThing',
      kind: 12,
      kindName: 'Function',
      containerName: 'Parser',
      path: path.join(ROOT_A, 'lib', 'parser.ts'),
      uri: 'file:///repo/a/lib/parser.ts',
      range: { start: { row: 4, column: 2 }, end: { row: 4, column: 12 } }
    },
    overrides
  );
}

describe('finding the root a symbol belongs to', () => {
  it('takes the longest match, so a nested root wins', () => {
    const file = path.join(NESTED, 'src', 'x.ts');
    assert.strictEqual(rootFor(file, [ROOT_A, NESTED]), NESTED);
    assert.strictEqual(rootFor(file, [NESTED, ROOT_A]), NESTED, 'order does not matter');
  });

  it('does not match a sibling that merely shares a prefix', () => {
    const sibling = path.join(path.sep, 'repo', 'a-other', 'x.ts');
    assert.strictEqual(rootFor(sibling, [ROOT_A]), null);
  });

  it('returns null when no root contains the file', () => {
    assert.strictEqual(rootFor(path.join(path.sep, 'tmp', 'x.ts'), [ROOT_A]), null);
    assert.strictEqual(rootFor(path.join(path.sep, 'tmp', 'x.ts'), []), null);
  });
});

describe('one symbol becomes one row', () => {
  it('splits the path the way openTag will rejoin it', () => {
    const item = itemForSymbol(symbol(), [ROOT_A]);
    assert.strictEqual(item.name, 'parseThing');
    assert.strictEqual(item.directory, ROOT_A);
    assert.strictEqual(item.file, path.join('lib', 'parser.ts'));
    assert.strictEqual(
      path.join(item.directory, item.file),
      path.join(ROOT_A, 'lib', 'parser.ts'),
      'joining them back has to give the file the server named'
    );
    assert.deepStrictEqual(item.position, { row: 4, column: 2 });
    assert.strictEqual(item.kindName, 'Function');
    assert.strictEqual(item.containerName, 'Parser');
  });

  it('still opens a symbol that lives outside every root', () => {
    const outside = path.join(path.sep, 'usr', 'lib', 'node_modules', 'dep', 'index.d.ts');
    const item = itemForSymbol(symbol({ path: outside }), [ROOT_A]);
    assert.strictEqual(
      path.join(item.directory, item.file),
      outside,
      'a definition inside a dependency is a normal thing to jump to'
    );
  });

  it('carries a null position rather than guessing a line', () => {
    const item = itemForSymbol(symbol({ range: null }), [ROOT_A]);
    assert.strictEqual(
      item.position,
      null,
      'an LSP 3.17 symbol may name a file and no line; opening the file is honest'
    );
    assert.strictEqual(item.file, path.join('lib', 'parser.ts'));
  });

  it('drops what cannot be opened', () => {
    assert.strictEqual(itemForSymbol(null, [ROOT_A]), null);
    assert.strictEqual(itemForSymbol(symbol({ path: null }), [ROOT_A]), null);
    assert.strictEqual(itemForSymbol(symbol({ name: '' }), [ROOT_A]), null);
  });

  it('skips those in a list rather than leaving holes in it', () => {
    const items = itemsForSymbols(
      [symbol(), null, symbol({ path: null }), symbol({ name: 'other' })],
      [ROOT_A]
    );
    assert.deepStrictEqual(items.map(i => i.name), ['parseThing', 'other']);
    assert.deepStrictEqual(itemsForSymbols(null, [ROOT_A]), []);
  });
});

describe('deciding whether to ask a server at all', () => {
  const sessionsOf = (...sessions) => ({
    projectSymbols: async () => [],
    listSessions: () => sessions
  });

  it('says yes when some running server answers workspace symbols', () => {
    assert.strictEqual(
      lspServesProjectSymbols(
        sessionsOf({ serverId: 'json' }, { serverId: 'ts', servesWorkspaceSymbols: true })
      ),
      true
    );
  });

  it('says no when none of them does', () => {
    assert.strictEqual(
      lspServesProjectSymbols(sessionsOf({ serverId: 'json', servesWorkspaceSymbols: false })),
      false,
      'and the view falls back to ctags'
    );
    assert.strictEqual(lspServesProjectSymbols(sessionsOf()), false, 'no servers running');
  });

  it('says no when there is no LSP at all', () => {
    assert.strictEqual(lspServesProjectSymbols(null), false);
    assert.strictEqual(lspServesProjectSymbols({}), false);
    assert.strictEqual(
      lspServesProjectSymbols({ projectSymbols: async () => [] }),
      false,
      'an older core without listSessions'
    );
  });

  it('falls back rather than throwing when the client is unhappy', () => {
    assert.strictEqual(
      lspServesProjectSymbols({
        projectSymbols: async () => [],
        listSessions() {
          throw new Error('client not ready');
        }
      }),
      false
    );
  });
});
