'use strict';

/**
 * textDocument/definition → normalized location list.
 */

const { pointToLsp, lspToPoint } = require('../position');
const { pathToUri, uriToPath } = require('../path-uri');

/**
 * Normalize Location | Location[] | LocationLink[] | null
 * @param {unknown} result
 * @returns {Array<{ uri: string, path: string|null, range: {start, end}, originSelectionRange?: object }>}
 */
function normalizeDefinitionResult(result) {
  if (result == null) return [];
  const items = Array.isArray(result) ? result : [result];
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    // LocationLink
    if (item.targetUri) {
      const range = item.targetSelectionRange || item.targetRange;
      if (!range) continue;
      out.push({
        uri: item.targetUri,
        path: uriToPath(item.targetUri),
        range: {
          start: lspToPoint(range.start),
          end: lspToPoint(range.end)
        },
        originSelectionRange: item.originSelectionRange
          ? {
              start: lspToPoint(item.originSelectionRange.start),
              end: lspToPoint(item.originSelectionRange.end)
            }
          : null
      });
      continue;
    }
    // Location
    if (item.uri && item.range) {
      out.push({
        uri: item.uri,
        path: uriToPath(item.uri),
        range: {
          start: lspToPoint(item.range.start),
          end: lspToPoint(item.range.end)
        }
      });
    }
  }
  return out;
}

/**
 * @param {{ request: Function, getServerIdForEditor: Function }} client
 * @param {object} editor
 * @param {{row:number, column:number}|null} [point]
 */
async function definitionAt(client, editor, point) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const pos = point || (editor.getCursorBufferPosition && editor.getCursorBufferPosition());
  if (!pos) return [];

  const { result, error } = await client.request(
    serverId,
    'textDocument/definition',
    {
      textDocument: { uri },
      position: pointToLsp(pos)
    },
    15000
  );

  if (error) return [];
  return normalizeDefinitionResult(result);
}

module.exports = {
  definitionAt,
  normalizeDefinitionResult
};
