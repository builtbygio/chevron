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
    /** @type {WeakMap<object, {uri:string, version:number, serverId:string, disposables: object[]}>} */
    this._state = new WeakMap();
    /** @type {Set<object>} */
    this._editors = new Set();
  }

  observeEditor(editor) {
    if (!editor) return;
    if (this._state.has(editor)) {
      this._editors.add(editor);
      return;
    }
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

    this.notify(serverId, 'textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text: editor.getText()
      }
    });

    const disposables = [];
    const state = { uri, version, serverId, disposables };
    this._state.set(editor, state);
    this._editors.add(editor);

    if (editor.onDidChange) {
      disposables.push(
        editor.onDidChange(() => {
          state.version += 1;
          const sid = this.getServerIdForEditor(editor) || state.serverId;
          this.notify(sid, 'textDocument/didChange', {
            textDocument: { uri, version: state.version },
            contentChanges: [{ text: editor.getText() }]
          });
        })
      );
    }

    if (editor.onDidSave) {
      disposables.push(
        editor.onDidSave(() => {
          const sid = this.getServerIdForEditor(editor) || state.serverId;
          this.notify(sid, 'textDocument/didSave', {
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
    this._editors.delete(editor);
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

  /**
   * After a language-server crash restart, re-send didOpen for tracked editors.
   */
  resyncAll() {
    for (const editor of this._editors) {
      this._resyncEditor(editor);
    }
  }

  _resyncEditor(editor) {
    const state = this._state.get(editor);
    if (!state || !editor) return;
    const serverId = this.getServerIdForEditor(editor);
    if (!serverId) return;
    state.serverId = serverId;
    state.version = (state.version || 0) + 1;
    const grammar = editor.getGrammar && editor.getGrammar();
    const languageId =
      languageIdForScope(grammar && grammar.scopeName) || 'plaintext';
    this.notify(serverId, 'textDocument/didOpen', {
      textDocument: {
        uri: state.uri,
        languageId,
        version: state.version,
        text: editor.getText()
      }
    });
  }
}

module.exports = { DocumentSync, pointToLsp };
