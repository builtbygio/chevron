'use strict';

/**
 * autocomplete.provider v4.0 adapter for LSP textDocument/completion.
 *
 * Ranking strategy (docs/reference/lsp-design.md §5.7 / §12.9):
 * - inclusionPriority 1 + excludeLowerPriority true → drops subsequence (0)
 *   but keeps snippets (1)
 * - high suggestionPriority so LSP list sorts above peers
 * - filterSuggestions false; preserve server order (sortText lives server-side)
 * - isIncomplete → re-query each keystroke (autocomplete-plus still re-asks)
 * - cancel via generation counter (stale responses discarded)
 */

const { pointToLsp, pointToLspWithEncoding } = require('../position');
const { pathToUri } = require('../path-uri');
const { normalizeMarkup } = require('../markup');

// LSP CompletionItemKind → autocomplete-plus type string
const KIND_TO_TYPE = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  11: 'unit',
  12: 'value',
  13: 'enum',
  14: 'keyword',
  15: 'snippet',
  16: 'constant', // color
  17: 'file',
  18: 'import', // reference
  19: 'folder',
  20: 'constant', // enumMember
  21: 'constant',
  22: 'class', // struct
  23: 'type', // event
  24: 'function', // operator
  25: 'type'
};

/**
 * @param {object} item LSP CompletionItem
 * @param {string} prefix
 */
function mapCompletionItem(item, prefix) {
  if (!item || typeof item !== 'object') return null;

  const label =
    typeof item.label === 'string'
      ? item.label
      : item.label && item.label.label
        ? item.label.label
        : '';
  if (!label) return null;

  const insertText = item.insertText != null ? item.insertText : label;
  const isSnippet = item.insertTextFormat === 2; // Snippet

  // textEdit may replace a range behind the cursor — derive replacementPrefix
  let replacementPrefix = prefix || '';
  if (item.textEdit && item.textEdit.range && item.textEdit.newText != null) {
    // Prefer newText from textEdit; prefix must match what will be replaced.
    // Without buffer line context we keep the request prefix (Phase 2).
    replacementPrefix = prefix || '';
  }

  const suggestion = {
    displayText: label,
    type: KIND_TO_TYPE[item.kind] || 'value',
    rightLabel: item.detail || undefined,
    replacementPrefix,
    // Keep server order: autocomplete-plus has no sortText; we return in order.
    // Attach raw for resolve + debugging.
    _lspItem: item
  };

  if (isSnippet) {
    suggestion.snippet = insertText;
  } else if (item.textEdit && item.textEdit.newText != null) {
    suggestion.text = item.textEdit.newText;
  } else {
    suggestion.text = insertText;
  }

  if (item.documentation) {
    const doc = normalizeMarkup(item.documentation);
    if (doc.value) suggestion.description = doc.value;
  }

  return suggestion;
}

/**
 * Map LSP completion result → suggestion array (server order preserved).
 * @param {unknown} result
 * @param {string} prefix
 * @returns {{ suggestions: object[], isIncomplete: boolean }}
 */
function mapCompletionResult(result, prefix) {
  if (result == null) return { suggestions: [], isIncomplete: false };
  let items;
  let isIncomplete = false;
  if (Array.isArray(result)) {
    items = result;
  } else if (typeof result === 'object') {
    items = result.items || [];
    isIncomplete = Boolean(result.isIncomplete);
  } else {
    return { suggestions: [], isIncomplete: false };
  }
  const suggestions = [];
  for (const item of items) {
    const s = mapCompletionItem(item, prefix);
    if (s) suggestions.push(s);
  }
  return { suggestions, isIncomplete };
}

/**
 * Build an autocomplete-plus v4 provider bound to the LSP client.
 * @param {{ request: Function, getServerIdForEditor: Function, isActiveForEditor?: Function }} client
 */
function createAutocompleteProvider(client) {
  let generation = 0;

  return {
    // Broad selector — getServerIdForEditor gates actual work per language
    selector:
      '.source.ts, .source.tsx, .source.js, .source.js.jsx, .source.jsx, .source.flow, .source.rust, .source.python',
    disableForSelector: '.comment, .string',
    inclusionPriority: 1,
    // Only claim exclusivity when a server will actually answer.
    //
    // The selector above is deliberately broad and getSuggestions gates the
    // real work on getServerIdForEditor. But excludeLowerPriority is read by
    // autocomplete-plus at *filter* time, before getSuggestions runs, so a
    // static `true` dropped the built-in subsequence provider (priority 0)
    // even when no server was running -- and getSuggestions then returned []
    // because there was no serverId. The result was no completions at all in
    // .ts/.tsx/.js/.jsx/.flow/.rust/.python, the languages this is meant to
    // improve. Reading it as a getter keeps the ranking intent (LSP wins when
    // present, snippets survive at priority 1) without that failure mode.
    get excludeLowerPriority() {
      try {
        const editor =
          typeof chevron !== 'undefined' &&
          chevron.workspace &&
          chevron.workspace.getActiveTextEditor();
        return Boolean(editor && client.getServerIdForEditor(editor));
      } catch (error) {
        return false;
      }
    },
    suggestionPriority: 5,
    // Server order is semantic; do not re-fuzzy locally.
    filterSuggestions: false,

    getSuggestions(request) {
      const { editor, bufferPosition, prefix, activatedManually } = request;
      if (!editor) return Promise.resolve([]);

      const serverId = client.getServerIdForEditor(editor);
      if (!serverId) return Promise.resolve([]);

      // Only complete when a prefix exists or user forced activation
      if (!activatedManually && (!prefix || prefix.length === 0)) {
        return Promise.resolve([]);
      }

      const filePath = editor.getPath && editor.getPath();
      if (!filePath) return Promise.resolve([]);
      const uri = pathToUri(filePath);
      if (!uri) return Promise.resolve([]);

      const encoding =
        (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
        'utf-16';
      let position;
      if (encoding === 'utf-8' && editor.lineTextForBufferRow) {
        const line = editor.lineTextForBufferRow(bufferPosition.row) || '';
        position = pointToLspWithEncoding(line, bufferPosition, 'utf-8');
      } else {
        position = pointToLsp(bufferPosition);
      }

      const myGen = ++generation;
      const started = Date.now();

      return client
        .request(
          serverId,
          'textDocument/completion',
          {
            textDocument: { uri },
            position,
            context: {
              triggerKind: activatedManually ? 1 : 1 // Invoked
            }
          },
          8000
        )
        .then(({ result, error }) => {
          if (myGen !== generation) return []; // superseded
          if (error) return [];
          const { suggestions } = mapCompletionResult(result, prefix || '');
          const ms = Date.now() - started;
          if (typeof client.recordCompletionLatency === 'function') {
            client.recordCompletionLatency(ms, suggestions.length);
          }
          return suggestions;
        })
        .catch(() => []);
    },

    getSuggestionDetailsOnSelect(suggestion) {
      if (!suggestion || !suggestion._lspItem) return Promise.resolve(suggestion);
      const item = suggestion._lspItem;
      // Only resolve if server said so
      if (!item.data && item.detail != null && item.documentation != null) {
        return Promise.resolve(suggestion);
      }

      // Need an editor context for serverId — resolve via last active editor
      const env = global.chevron;
      const editor =
        env && env.workspace && env.workspace.getActiveTextEditor
          ? env.workspace.getActiveTextEditor()
          : null;
      if (!editor) return Promise.resolve(suggestion);
      const serverId = client.getServerIdForEditor(editor);
      if (!serverId) return Promise.resolve(suggestion);

      return client
        .request(serverId, 'completionItem/resolve', item, 5000)
        .then(({ result, error }) => {
          if (error || !result) return suggestion;
          const mapped = mapCompletionItem(
            result,
            suggestion.replacementPrefix || ''
          );
          if (!mapped) return suggestion;
          // Merge resolved fields into the selected suggestion object
          if (mapped.description) suggestion.description = mapped.description;
          if (mapped.rightLabel) suggestion.rightLabel = mapped.rightLabel;
          if (mapped.snippet) suggestion.snippet = mapped.snippet;
          if (mapped.text) suggestion.text = mapped.text;
          suggestion._lspItem = result;
          return suggestion;
        })
        .catch(() => suggestion);
    }
  };
}

module.exports = {
  createAutocompleteProvider,
  mapCompletionItem,
  mapCompletionResult,
  KIND_TO_TYPE
};
