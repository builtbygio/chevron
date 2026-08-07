'use strict';

/**
 * textDocument/hover request + response normalization.
 */

const { pointToLsp } = require('../position');
const { pathToUri } = require('../path-uri');
const { normalizeMarkup } = require('../markup');

/**
 * @param {{ request: Function, getServerIdForEditor: Function }} client
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
      position: pointToLsp(pos)
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
