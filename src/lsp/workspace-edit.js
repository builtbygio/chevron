'use strict';

/**
 * Apply LSP WorkspaceEdit with per-buffer transactions and rollback on failure.
 * Multi-file: one undo step per file (grouped via buffer.transact).
 * See docs/lsp-design.md Phase 4.
 */

const fs = require('fs');
const { lspToPoint, lspToPointWithEncoding } = require('./position');
const { uriToPath } = require('./path-uri');

/**
 * @param {object} edit WorkspaceEdit
 * @returns {Array<{ uri: string, path: string|null, edits: Array<{range, newText}> }>}
 */
function normalizeWorkspaceEdit(edit) {
  if (!edit || typeof edit !== 'object') return [];
  /** @type {Map<string, {uri, path, edits}>} */
  const byUri = new Map();

  function add(uri, textEdits) {
    if (!uri || !Array.isArray(textEdits)) return;
    let entry = byUri.get(uri);
    if (!entry) {
      entry = { uri, path: uriToPath(uri), edits: [] };
      byUri.set(uri, entry);
    }
    for (const te of textEdits) {
      if (!te || !te.range || te.newText == null) continue;
      entry.edits.push({
        range: te.range,
        newText: String(te.newText)
      });
    }
  }

  if (edit.changes && typeof edit.changes === 'object') {
    for (const [uri, textEdits] of Object.entries(edit.changes)) {
      add(uri, textEdits);
    }
  }

  if (Array.isArray(edit.documentChanges)) {
    for (const change of edit.documentChanges) {
      if (!change) continue;
      // TextDocumentEdit
      if (change.textDocument && change.textDocument.uri) {
        add(change.textDocument.uri, change.edits || []);
        continue;
      }
      // CreateFile / RenameFile / DeleteFile — Phase 4: skip with note
      // (apply only pure text edits for v1 correctness)
    }
  }

  return [...byUri.values()].filter(e => e.edits.length > 0);
}

/**
 * Sort edits bottom-to-top so earlier ranges stay valid.
 * @param {Array<{range, newText}>} edits
 */
function sortEditsDescending(edits) {
  return edits.slice().sort((a, b) => {
    const al = a.range.start.line;
    const bl = b.range.start.line;
    if (al !== bl) return bl - al;
    return (b.range.start.character || 0) - (a.range.start.character || 0);
  });
}

function rangeToBufferRange(range, buffer, encoding) {
  const startLine =
    buffer.lineForRow && buffer.lineForRow(range.start.line) != null
      ? buffer.lineForRow(range.start.line)
      : '';
  const endLine =
    buffer.lineForRow && buffer.lineForRow(range.end.line) != null
      ? buffer.lineForRow(range.end.line)
      : '';
  const start =
    encoding === 'utf-8'
      ? lspToPointWithEncoding(startLine || '', range.start, 'utf-8')
      : lspToPoint(range.start);
  const end =
    encoding === 'utf-8'
      ? lspToPointWithEncoding(endLine || '', range.end, 'utf-8')
      : lspToPoint(range.end);
  return { start, end };
}

/**
 * @param {object} buffer TextBuffer
 * @param {Array<{range, newText}>} edits
 * @param {string} encoding
 */
function applyEditsToBuffer(buffer, edits, encoding) {
  const ordered = sortEditsDescending(edits);
  const apply = () => {
    for (const te of ordered) {
      const r = rangeToBufferRange(te.range, buffer, encoding);
      buffer.setTextInRange([r.start, r.end], te.newText);
    }
  };
  if (typeof buffer.transact === 'function') {
    buffer.transact(apply);
  } else {
    apply();
  }
}

/**
 * Open or find a TextBuffer for path.
 * @param {string} filePath
 * @param {object} env chevron/atom
 */
async function resolveBuffer(filePath, env) {
  if (!filePath || !env || !env.workspace) return null;

  // Prefer already-open editors
  const editors = env.workspace.getTextEditors ? env.workspace.getTextEditors() : [];
  for (const ed of editors) {
    if (ed.getPath && ed.getPath() === filePath) {
      return ed.getBuffer();
    }
  }

  // Open file (may create editor)
  if (fs.existsSync(filePath)) {
    const editor = await env.workspace.open(filePath, {
      activateItem: false,
      activatePane: false,
      searchAllPanes: true
    });
    return editor && editor.getBuffer ? editor.getBuffer() : null;
  }

  return null;
}

/**
 * Apply a WorkspaceEdit.
 * @param {object} edit
 * @param {{ env: object, getEncodingForUri?: (uri:string)=>string }} opts
 * @returns {Promise<{ ok: boolean, files: number, edits: number, error?: string }>}
 */
async function applyWorkspaceEdit(edit, opts = {}) {
  const env = opts.env || global.chevron;
  const docs = normalizeWorkspaceEdit(edit);
  if (docs.length === 0) {
    return { ok: true, files: 0, edits: 0 };
  }

  /** @type {Array<{ buffer, checkpoint }>} */
  const checkpoints = [];
  let totalEdits = 0;

  try {
    for (const doc of docs) {
      if (!doc.path) {
        throw new Error(`Cannot resolve path for ${doc.uri}`);
      }
      const buffer = await resolveBuffer(doc.path, env);
      if (!buffer) {
        throw new Error(`Cannot open buffer for ${doc.path}`);
      }
      const encoding =
        (opts.getEncodingForUri && opts.getEncodingForUri(doc.uri)) || 'utf-16';
      let checkpoint = null;
      if (typeof buffer.createCheckpoint === 'function') {
        checkpoint = buffer.createCheckpoint();
      }
      checkpoints.push({ buffer, checkpoint });
      applyEditsToBuffer(buffer, doc.edits, encoding);
      totalEdits += doc.edits.length;
    }
    return { ok: true, files: docs.length, edits: totalEdits };
  } catch (err) {
    // Rollback in reverse order
    for (let i = checkpoints.length - 1; i >= 0; i--) {
      const { buffer, checkpoint } = checkpoints[i];
      try {
        if (checkpoint != null && typeof buffer.revertToCheckpoint === 'function') {
          buffer.revertToCheckpoint(checkpoint);
        }
      } catch (_) {
        /* best effort */
      }
    }
    return {
      ok: false,
      files: 0,
      edits: 0,
      error: err.message || String(err)
    };
  }
}

/**
 * Apply a single-document TextEdit[] (formatting).
 * @param {object} editor
 * @param {Array} textEdits
 * @param {string} encoding
 */
function applyTextEditsToEditor(editor, textEdits, encoding) {
  if (!editor || !Array.isArray(textEdits) || textEdits.length === 0) {
    return { ok: true, edits: 0 };
  }
  const buffer = editor.getBuffer();
  applyEditsToBuffer(
    buffer,
    textEdits.map(te => ({ range: te.range, newText: te.newText })),
    encoding || 'utf-16'
  );
  return { ok: true, edits: textEdits.length };
}

module.exports = {
  normalizeWorkspaceEdit,
  sortEditsDescending,
  applyWorkspaceEdit,
  applyTextEditsToEditor,
  rangeToBufferRange
};
