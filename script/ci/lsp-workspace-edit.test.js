'use strict';

/**
 * Phase 4 workspace-edit + provider unit tests (no Electron).
 * Run: node --test script/ci/lsp-workspace-edit.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  normalizeWorkspaceEdit,
  sortEditsDescending,
  applyTextEditsToEditor
} = require('../../src/lsp/workspace-edit');
const { normalizeCodeActions } = require('../../src/lsp/providers/code-action');
const { normalizeDocumentSymbols } = require('../../src/lsp/providers/document-symbols');
const { prepareRename, renameAt } = require('../../src/lsp/providers/rename');
const { formattingOptions } = require('../../src/lsp/providers/format');

describe('workspace edit normalize', () => {
  it('merges changes map', () => {
    const docs = normalizeWorkspaceEdit({
      changes: {
        'file:///tmp/a.ts': [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 3 }
            },
            newText: 'foo'
          }
        ]
      }
    });
    assert.strictEqual(docs.length, 1);
    assert.ok(docs[0].path && docs[0].path.includes('a.ts'));
    assert.strictEqual(docs[0].edits[0].newText, 'foo');
  });

  it('handles documentChanges TextDocumentEdit', () => {
    const docs = normalizeWorkspaceEdit({
      documentChanges: [
        {
          textDocument: { uri: 'file:///tmp/b.ts', version: 1 },
          edits: [
            {
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 1 }
              },
              newText: 'x'
            }
          ]
        }
      ]
    });
    assert.strictEqual(docs.length, 1);
    assert.strictEqual(docs[0].edits.length, 1);
  });

  it('sorts edits descending by position', () => {
    const sorted = sortEditsDescending([
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        newText: 'a'
      },
      {
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 1 } },
        newText: 'b'
      },
      {
        range: { start: { line: 5, character: 3 }, end: { line: 5, character: 4 } },
        newText: 'c'
      }
    ]);
    assert.strictEqual(sorted[0].newText, 'c');
    assert.strictEqual(sorted[1].newText, 'b');
    assert.strictEqual(sorted[2].newText, 'a');
  });

  it('applies edits to mock buffer bottom-up in one transact', () => {
    // Simple string buffer mock
    let text = 'hello world';
    const lines = () => text.split('\n');
    const buffer = {
      lineForRow(row) {
        return lines()[row] || '';
      },
      setTextInRange(range, newText) {
        // range is [{row,col},{row,col}] or {start,end}
        const start = range.start || range[0];
        const end = range.end || range[1];
        // only single-line for this test
        const ls = lines();
        const line = ls[start.row] || '';
        ls[start.row] =
          line.slice(0, start.column) + newText + line.slice(end.column);
        text = ls.join('\n');
      },
      transact(fn) {
        fn();
      }
    };

    // Replace "world" then "hello" — if top-down order breaks, wrong result
    applyTextEditsToEditor(
      {
        getBuffer: () => buffer
      },
      [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 }
          },
          newText: 'hi'
        },
        {
          range: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 11 }
          },
          newText: 'there'
        }
      ],
      'utf-16'
    );
    assert.strictEqual(text, 'hi there');
  });
});

describe('code actions normalize', () => {
  it('maps CodeAction with edit', () => {
    const actions = normalizeCodeActions([
      {
        title: 'Fix import',
        kind: 'quickfix',
        edit: { changes: {} }
      },
      {
        title: 'Run cmd',
        command: { command: 'do.it', arguments: [1] }
      }
    ]);
    assert.strictEqual(actions.length, 2);
    assert.strictEqual(actions[0].title, 'Fix import');
    assert.ok(actions[0].edit);
    assert.ok(actions[1].isCommand);
  });
});

describe('document symbols normalize', () => {
  it('flattens hierarchical DocumentSymbol', () => {
    const list = normalizeDocumentSymbols([
      {
        name: 'Foo',
        kind: 5,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 }
        },
        selectionRange: {
          start: { line: 0, character: 6 },
          end: { line: 0, character: 9 }
        },
        children: [
          {
            name: 'bar',
            kind: 6,
            range: {
              start: { line: 2, character: 2 },
              end: { line: 4, character: 3 }
            },
            selectionRange: {
              start: { line: 2, character: 2 },
              end: { line: 2, character: 5 }
            }
          }
        ]
      }
    ]);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].name, 'Foo');
    assert.strictEqual(list[0].kindName, 'Class');
    assert.strictEqual(list[1].name, 'bar');
    assert.strictEqual(list[1].containerName, 'Foo');
  });

  it('maps SymbolInformation', () => {
    const list = normalizeDocumentSymbols([
      {
        name: 'x',
        kind: 13,
        location: {
          uri: 'file:///t.ts',
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 1 }
          }
        },
        containerName: 'mod'
      }
    ]);
    assert.strictEqual(list[0].kindName, 'Variable');
    assert.strictEqual(list[0].containerName, 'mod');
  });
});

describe('rename provider', () => {
  it('prepareRename falls back when server errors', async () => {
    const client = {
      getServerIdForEditor: () => 's',
      request: async () => ({ error: { message: 'no' } })
    };
    const editor = {
      getPath: () => '/tmp/a.ts',
      getCursorBufferPosition: () => ({ row: 0, column: 0 }),
      getWordUnderCursor: () => 'widget'
    };
    const prep = await prepareRename(client, editor);
    assert.strictEqual(prep.placeholder, 'widget');
  });

  it('renameAt returns workspace edit', async () => {
    const client = {
      getServerIdForEditor: () => 's',
      request: async (id, method, params) => {
        assert.strictEqual(method, 'textDocument/rename');
        assert.strictEqual(params.newName, 'New');
        return {
          result: {
            changes: {
              'file:///tmp/a.ts': []
            }
          }
        };
      }
    };
    const editor = {
      getPath: () => '/tmp/a.ts',
      getCursorBufferPosition: () => ({ row: 0, column: 0 })
    };
    const edit = await renameAt(client, editor, 'New');
    assert.ok(edit.changes);
  });
});

describe('formatting options', () => {
  it('reads tab size from editor', () => {
    const opts = formattingOptions(
      { getTabLength: () => 4, getSoftTabs: () => true },
      null
    );
    assert.strictEqual(opts.tabSize, 4);
    assert.strictEqual(opts.insertSpaces, true);
  });
});
