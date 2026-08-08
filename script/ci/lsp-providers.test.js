'use strict';

/**
 * Phase 2 provider unit tests (no Electron, no real server).
 * Run: node --test script/ci/lsp-providers.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const {
  mapCompletionItem,
  mapCompletionResult
} = require('../../src/lsp/providers/autocomplete');
const { normalizeDefinitionResult } = require('../../src/lsp/providers/definitions');
const { normalizeMarkup, stripHtml, escapeHtml } = require('../../src/lsp/markup');
const { hoverAt } = require('../../src/lsp/providers/hover');
const { definitionAt } = require('../../src/lsp/providers/definitions');
const { createAutocompleteProvider } = require('../../src/lsp/providers/autocomplete');

describe('markup', () => {
  it('normalizes plaintext string', () => {
    assert.deepStrictEqual(normalizeMarkup('hello'), {
      kind: 'plaintext',
      value: 'hello'
    });
  });

  it('normalizes MarkupContent markdown', () => {
    const m = normalizeMarkup({ kind: 'markdown', value: '**x**' });
    assert.strictEqual(m.kind, 'markdown');
    assert.strictEqual(m.value, '**x**');
  });

  it('normalizes MarkedString language block', () => {
    const m = normalizeMarkup({ language: 'ts', value: 'const x = 1' });
    assert.ok(m.value.includes('```ts'));
    assert.ok(m.value.includes('const x = 1'));
  });

  it('strips script tags inertly', () => {
    const cleaned = stripHtml('hi<script>alert(1)</script>there');
    assert.strictEqual(cleaned, 'hithere');
  });

  it('escapeHtml escapes angle brackets', () => {
    assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
  });
});

describe('definition normalize', () => {
  it('handles single Location', () => {
    const locs = normalizeDefinitionResult({
      uri: 'file:///tmp/a.ts',
      range: {
        start: { line: 2, character: 4 },
        end: { line: 2, character: 10 }
      }
    });
    assert.strictEqual(locs.length, 1);
    assert.strictEqual(locs[0].range.start.row, 2);
    assert.strictEqual(locs[0].range.start.column, 4);
    assert.ok(locs[0].path && locs[0].path.includes('a.ts'));
  });

  it('handles LocationLink[]', () => {
    const locs = normalizeDefinitionResult([
      {
        targetUri: 'file:///tmp/b.ts',
        targetRange: {
          start: { line: 0, character: 0 },
          end: { line: 10, character: 0 }
        },
        targetSelectionRange: {
          start: { line: 1, character: 2 },
          end: { line: 1, character: 5 }
        }
      }
    ]);
    assert.strictEqual(locs.length, 1);
    assert.strictEqual(locs[0].range.start.row, 1);
    assert.strictEqual(locs[0].range.start.column, 2);
  });

  it('returns empty for null', () => {
    assert.deepStrictEqual(normalizeDefinitionResult(null), []);
  });
});

describe('completion map', () => {
  it('maps plain text item', () => {
    const s = mapCompletionItem(
      { label: 'foo', kind: 6, insertText: 'foo', detail: 'number' },
      'fo'
    );
    assert.strictEqual(s.text, 'foo');
    assert.strictEqual(s.type, 'variable');
    assert.strictEqual(s.rightLabel, 'number');
    assert.strictEqual(s.replacementPrefix, 'fo');
  });

  it('maps snippet format', () => {
    const s = mapCompletionItem(
      { label: 'fn', insertText: 'fn($1)', insertTextFormat: 2 },
      'f'
    );
    assert.strictEqual(s.snippet, 'fn($1)');
    assert.ok(!s.text);
  });

  it('preserves server order and isIncomplete', () => {
    const { suggestions, isIncomplete } = mapCompletionResult(
      {
        isIncomplete: true,
        items: [{ label: 'z' }, { label: 'a' }]
      },
      ''
    );
    assert.strictEqual(isIncomplete, true);
    assert.strictEqual(suggestions[0].displayText, 'z');
    assert.strictEqual(suggestions[1].displayText, 'a');
  });

  it('handles CompletionItem[] array form', () => {
    const { suggestions } = mapCompletionResult([{ label: 'only' }], '');
    assert.strictEqual(suggestions.length, 1);
  });
});

describe('provider client integration (mock)', () => {
  function mockEditor(overrides = {}) {
    return {
      getPath: () => '/tmp/proj/file.ts',
      getCursorBufferPosition: () => ({ row: 1, column: 2 }),
      getGrammar: () => ({ scopeName: 'source.ts' }),
      ...overrides
    };
  }

  it('hoverAt returns normalized contents', async () => {
    const client = {
      getServerIdForEditor: () => 'srv:1',
      request: async () => ({
        result: { contents: { kind: 'plaintext', value: 'docs here' } }
      })
    };
    const h = await hoverAt(client, mockEditor());
    assert.strictEqual(h.contents.value, 'docs here');
  });

  it('hoverAt returns null without server', async () => {
    const client = {
      getServerIdForEditor: () => null,
      request: async () => {
        throw new Error('should not call');
      }
    };
    assert.strictEqual(await hoverAt(client, mockEditor()), null);
  });

  it('definitionAt returns locations', async () => {
    const client = {
      getServerIdForEditor: () => 'srv:1',
      request: async () => ({
        result: {
          uri: 'file:///tmp/proj/file.ts',
          range: {
            start: { line: 5, character: 0 },
            end: { line: 5, character: 3 }
          }
        }
      })
    };
    const locs = await definitionAt(client, mockEditor());
    assert.strictEqual(locs.length, 1);
    assert.strictEqual(locs[0].range.start.row, 5);
  });

  it('autocomplete provider cancels stale generations', async () => {
    let resolveFirst;
    const first = new Promise(r => {
      resolveFirst = r;
    });
    let calls = 0;
    const client = {
      getServerIdForEditor: () => 'srv:1',
      request: async () => {
        calls += 1;
        if (calls === 1) {
          await first;
          return {
            result: { items: [{ label: 'stale' }] }
          };
        }
        return {
          result: { items: [{ label: 'fresh' }] }
        };
      },
      recordCompletionLatency: () => {}
    };
    const provider = createAutocompleteProvider(client);
    const editor = mockEditor();
    const p1 = provider.getSuggestions({
      editor,
      bufferPosition: { row: 0, column: 1 },
      prefix: 'a',
      activatedManually: false
    });
    const p2 = provider.getSuggestions({
      editor,
      bufferPosition: { row: 0, column: 2 },
      prefix: 'ab',
      activatedManually: false
    });
    resolveFirst();
    const [r1, r2] = await Promise.all([p1, p2]);
    // first response discarded as stale
    assert.deepStrictEqual(r1, []);
    assert.strictEqual(r2[0].displayText, 'fresh');
  });
});
