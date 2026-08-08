'use strict';

/**
 * textDocument/definition → normalized location list.
 */

const { pointToLsp, lspToPoint, pointToLspWithEncoding } = require('../position');
const { pathToUri, uriToPath } = require('../path-uri');
const { createConverter, collectRefs } = require('../inbound-position');

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
 * Normalize Location | Location[] | LocationLink[] | null
 *
 * `convert` maps an LSP position to an Atom point. It defaults to the plain
 * utf-16 passthrough; `definitionAt` supplies an encoding-aware converter for
 * utf-8 sessions (goal G7 — see ../inbound-position.js).
 *
 * @param {unknown} result
 * @param {(pos: object, uri?: string) => object} [convert]
 * @returns {Array<{ uri: string, path: string|null, range: {start, end}, originSelectionRange?: object }>}
 */
function normalizeDefinitionResult(result, convert = lspToPoint) {
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
          start: convert(range.start, item.targetUri),
          end: convert(range.end, item.targetUri)
        },
        originSelectionRange: item.originSelectionRange
          ? {
              // origin ranges are in the *requesting* document
              start: convert(item.originSelectionRange.start, item.originUri),
              end: convert(item.originSelectionRange.end, item.originUri)
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
          start: convert(item.range.start, item.uri),
          end: convert(item.range.end, item.uri)
        }
      });
    }
  }
  return out;
}

/**
 * Every {uri, range} an LSP location result refers to, for line pre-loading.
 * @param {unknown} result
 */
function refsForResult(result) {
  if (result == null) return [];
  const items = Array.isArray(result) ? result : [result];
  const entries = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (item.targetUri) {
      const range = item.targetSelectionRange || item.targetRange;
      if (range) entries.push({ uri: item.targetUri, ranges: [range] });
      if (item.originSelectionRange && item.originUri) {
        entries.push({ uri: item.originUri, ranges: [item.originSelectionRange] });
      }
    } else if (item.uri && item.range) {
      entries.push({ uri: item.uri, ranges: [item.range] });
    }
  }
  return collectRefs(entries);
}

/**
 * Normalize with an encoding-aware converter. utf-16 sessions take the same
 * synchronous path as before; utf-8 sessions pre-load the referenced lines.
 * @param {unknown} result
 * @param {'utf-16'|'utf-8'} encoding
 */
async function normalizeDefinitionResultForEncoding(result, encoding) {
  if (encoding !== 'utf-8') return normalizeDefinitionResult(result);
  const convert = await createConverter('utf-8', refsForResult(result));
  return normalizeDefinitionResult(result, convert);
}

/**
 * @param {{ request: Function, getServerIdForEditor: Function, getPositionEncoding?: Function }} client
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
      position: positionFor(client, editor, serverId, pos)
    },
    15000
  );

  if (error) return [];
  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return normalizeDefinitionResultForEncoding(result, encoding);
}

module.exports = {
  definitionAt,
  normalizeDefinitionResult,
  normalizeDefinitionResultForEncoding,
  refsForResult
};
