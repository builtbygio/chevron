'use strict';

/**
 * textDocument/references → location list (reuse definition normalize).
 */

const { pointToLsp, pointToLspWithEncoding } = require('../position');
const { pathToUri } = require('../path-uri');
const { normalizeDefinitionResult } = require('./definitions');

/**
 * @param {{ request: Function, getServerIdForEditor: Function, getPositionEncoding?: Function }} client
 * @param {object} editor
 * @param {{row:number, column:number}|null} [point]
 * @param {{ includeDeclaration?: boolean }} [opts]
 */
async function referencesAt(client, editor, point, opts = {}) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const pos = point || (editor.getCursorBufferPosition && editor.getCursorBufferPosition());
  if (!pos) return [];

  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) || 'utf-16';
  let lspPos;
  if (encoding === 'utf-8' && editor.lineTextForBufferRow) {
    const line = editor.lineTextForBufferRow(pos.row) || '';
    lspPos = pointToLspWithEncoding(line, pos, 'utf-8');
  } else {
    lspPos = pointToLsp(pos);
  }

  const { result, error } = await client.request(
    serverId,
    'textDocument/references',
    {
      textDocument: { uri },
      position: lspPos,
      context: {
        includeDeclaration: opts.includeDeclaration !== false
      }
    },
    20000
  );

  if (error) return [];
  return normalizeDefinitionResult(result);
}

module.exports = { referencesAt };
