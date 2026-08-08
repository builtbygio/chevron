'use strict';

/**
 * textDocument/prepareRename + textDocument/rename
 */

const { pointToLsp, pointToLspWithEncoding, lspToPoint } = require('../position');
const { pathToUri } = require('../path-uri');

function positionFor(client, editor, serverId, pos) {
  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  if (encoding === 'utf-8' && editor.lineTextForBufferRow) {
    const line = editor.lineTextForBufferRow(pos.row) || '';
    return pointToLspWithEncoding(line, pos, 'utf-8');
  }
  return pointToLsp(pos);
}

/**
 * @returns {Promise<{placeholder: string, range?: object}|null>}
 */
async function prepareRename(client, editor, point) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return null;
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return null;
  const uri = pathToUri(filePath);
  if (!uri) return null;
  const pos = point || editor.getCursorBufferPosition();

  const { result, error } = await client.request(
    serverId,
    'textDocument/prepareRename',
    {
      textDocument: { uri },
      position: positionFor(client, editor, serverId, pos)
    },
    8000
  );

  if (error) {
    // prepareRename optional — fall back to word under cursor
    return fallbackPlaceholder(editor, pos);
  }
  if (result == null || result === false) return null;

  // prepareRename ranges are always in the *current* editor, so the sync
  // (open-buffer) converter is correct and needs no disk read (G7).
  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  const toPoint = createSyncConverter(encoding);

  // Range | { range, placeholder } | { defaultBehavior }
  if (result.defaultBehavior) {
    return fallbackPlaceholder(editor, pos);
  }
  if (result.range && result.placeholder != null) {
    return {
      placeholder: result.placeholder,
      range: {
        start: toPoint(result.range.start, uri),
        end: toPoint(result.range.end, uri)
      }
    };
  }
  if (result.start && result.end) {
    // bare Range
    const text =
      editor.getTextInBufferRange &&
      editor.getTextInBufferRange({
        start: toPoint(result.start, uri),
        end: toPoint(result.end, uri)
      });
    return {
      placeholder: text || '',
      range: {
        start: toPoint(result.start, uri),
        end: toPoint(result.end, uri)
      }
    };
  }
  return fallbackPlaceholder(editor, pos);
}

function fallbackPlaceholder(editor, pos) {
  if (editor.getWordUnderCursor) {
    const word = editor.getWordUnderCursor();
    if (word) return { placeholder: word };
  }
  // selection
  if (editor.getSelectedText) {
    const sel = editor.getSelectedText();
    if (sel) return { placeholder: sel };
  }
  return { placeholder: '' };
}

/**
 * @returns {Promise<object|null>} WorkspaceEdit
 */
async function renameAt(client, editor, newName, point) {
  if (!newName || typeof newName !== 'string') return null;
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return null;
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return null;
  const uri = pathToUri(filePath);
  if (!uri) return null;
  const pos = point || editor.getCursorBufferPosition();

  const { result, error } = await client.request(
    serverId,
    'textDocument/rename',
    {
      textDocument: { uri },
      position: positionFor(client, editor, serverId, pos),
      newName
    },
    30000
  );

  if (error || !result) return null;
  return result;
}

module.exports = { prepareRename, renameAt, fallbackPlaceholder };
