'use strict';

/**
 * textDocument/hover request + response normalization.
 */

const { pointToLsp, pointToLspWithEncoding } = require('../position');
const { pathToUri } = require('../path-uri');
const { normalizeMarkup } = require('../markup');

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
 * @param {{ request: Function, getServerIdForEditor: Function, getPositionEncoding?: Function }} client
 * @param {object} editor
 * @param {{row:number, column:number}|null} [point]
 * @returns {Promise<{ range?: object, contents: {kind:string, value:string}, raw: object }|null>}
 */
async function hoverAt(client, editor, point) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return null;

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return null;
  const uri = pathToUri(filePath);
  if (!uri) return null;

  const pos = point || (editor.getCursorBufferPosition && editor.getCursorBufferPosition());
  if (!pos) return null;

  const { result, error } = await client.request(
    serverId,
    'textDocument/hover',
    {
      textDocument: { uri },
      position: positionFor(client, editor, serverId, pos)
    },
    10000
  );

  if (error || result == null) return null;

  const markup = normalizeMarkup(result.contents);
  if (!markup.value) return null;

  return {
    range: result.range || null,
    contents: markup,
    raw: result
  };
}

module.exports = { hoverAt };
