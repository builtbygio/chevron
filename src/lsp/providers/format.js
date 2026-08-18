'use strict';

/**
 * textDocument/formatting (+ range formatting)
 */

const { pointToLsp, pointToLspWithEncoding } = require('../position');
const { pathToUri } = require('../path-uri');
const { applyTextEditsToEditor } = require('../workspace-edit');

function formattingOptions(editor, env) {
  const tabLength =
    (editor.getTabLength && editor.getTabLength()) ||
    (env && env.config && env.config.get('editor.tabLength')) ||
    2;
  const softTabs =
    editor.getSoftTabs != null
      ? editor.getSoftTabs()
      : env && env.config
        ? env.config.get('editor.softTabs') !== false
        : true;
  return {
    tabSize: tabLength,
    insertSpaces: softTabs
  };
}

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
 * Format whole document. Applies edits to the editor.
 * @returns {Promise<{ok:boolean, edits:number, error?:string}>}
 */
async function formatDocument(client, editor) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return { ok: false, edits: 0, error: 'no server' };
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return { ok: false, edits: 0, error: 'no path' };
  const uri = pathToUri(filePath);
  if (!uri) return { ok: false, edits: 0, error: 'no uri' };

  const env = global.chevron;
  const { result, error } = await client.request(
    serverId,
    'textDocument/formatting',
    {
      textDocument: { uri },
      options: formattingOptions(editor, env)
    },
    30000
  );

  if (error) {
    return { ok: false, edits: 0, error: error.message || String(error) };
  }
  if (!result || !result.length) return { ok: true, edits: 0 };

  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return applyTextEditsToEditor(editor, result, encoding);
}

/**
 * Format selection / range.
 */
async function formatRange(client, editor, range) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return { ok: false, edits: 0, error: 'no server' };
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return { ok: false, edits: 0, error: 'no path' };
  const uri = pathToUri(filePath);
  if (!uri) return { ok: false, edits: 0, error: 'no uri' };

  const r = range || (editor.getSelectedBufferRange && editor.getSelectedBufferRange());
  if (!r) return formatDocument(client, editor);

  const env = global.chevron;
  const { result, error } = await client.request(
    serverId,
    'textDocument/rangeFormatting',
    {
      textDocument: { uri },
      range: {
        start: positionFor(client, editor, serverId, r.start),
        end: positionFor(client, editor, serverId, r.end)
      },
      options: formattingOptions(editor, env)
    },
    30000
  );

  if (error) {
    // Fall back to full document format
    return formatDocument(client, editor);
  }
  if (!result || !result.length) return { ok: true, edits: 0 };

  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return applyTextEditsToEditor(editor, result, encoding);
}

module.exports = { formatDocument, formatRange, formattingOptions };
