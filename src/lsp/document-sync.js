'use strict';

/**
 * TextBuffer → LSP textDocument/* notifications.
 */

const { pathToUri } = require('./path-uri');
const { pointToLsp } = require('./position');
const { languageIdForScope } = require('./language-id');

class DocumentSync {
  /**
   * @param {{ notify: Function, getServerIdForEditor: Function }} opts
   */
  constructor(opts) {
    this.notify = opts.notify;
    this.getServerIdForEditor = opts.getServerIdForEditor;
    /** @type {WeakMap<object, {uri:string, version:number, disposables: object}>} */
    this._state = new WeakMap();
  }

  observeEditor(editor) {
    if (!editor || this._state.has(editor)) return;
    const serverId = this.getServerIdForEditor(editor);
    if (!serverId) return;

    const filePath = editor.getPath && editor.getPath();
    if (!filePath) return;
    const uri = pathToUri(filePath);
    if (!uri) return;

    const grammar = editor.getGrammar && editor.getGrammar();
    const languageId =
      languageIdForScope(grammar && grammar.scopeName) || 'plaintext';
    const version = 1;
    const text = editor.getText();

    this.notify(serverId, 'textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text
      }
    });

    const disposables = [];
    const state = { uri, version, serverId, disposables };
    this._state.set(editor, state);

    if (editor.onDidChange) {
      disposables.push(
        editor.onDidChange(() => {
          // Full sync for Phase 1 simplicity (incremental later)
          state.version += 1;
          this.notify(serverId, 'textDocument/didChange', {
            textDocument: { uri, version: state.version },
            contentChanges: [{ text: editor.getText() }]
          });
        })
      );
    }

    if (editor.onDidSave) {
      disposables.push(
        editor.onDidSave(() => {
          this.notify(serverId, 'textDocument/didSave', {
            textDocument: { uri }
          });
        })
      );
    }

    if (editor.onDidDestroy) {
      disposables.push(
        editor.onDidDestroy(() => {
          this.closeEditor(editor);
        })
      );
    }
  }

  closeEditor(editor) {
    const state = this._state.get(editor);
    if (!state) return;
    this._state.delete(editor);
    for (const d of state.disposables) {
      try {
        if (d && d.dispose) d.dispose();
      } catch (_) {
        /* ignore */
      }
    }
    this.notify(state.serverId, 'textDocument/didClose', {
      textDocument: { uri: state.uri }
    });
  }

  getUri(editor) {
    const s = this._state.get(editor);
    return s ? s.uri : null;
  }
}

module.exports = { DocumentSync, pointToLsp };
