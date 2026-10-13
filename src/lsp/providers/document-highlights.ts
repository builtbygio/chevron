'use strict';

/**
 * `textDocument/documentHighlight` — every use of the symbol at a position in
 * the same file, each marked as a read, a write or plain text.
 *
 * The ranges are all in the requesting document, so utf-8 positions convert
 * against the editor's own lines: no file I/O, which matters for a request
 * sent on every cursor move.
 */

const { pathToUri } = require('../path-uri');
const { lspToPointWithEncoding } = require('../position');
const { positionFor } = require('./definitions');

/** LSP DocumentHighlightKind. A highlight without one is `text`. */
export const HIGHLIGHT_KIND = {
  1: 'text',
  2: 'read',
  3: 'write'
};

export interface DocumentHighlight {
  range: { start: { row: number; column: number }; end: { row: number; column: number } };
  kind: 'text' | 'read' | 'write';
}

export function normalizeDocumentHighlights(
  result: any,
  lineForRow: (row: number) => string,
  encoding: string = 'utf-16'
): DocumentHighlight[] {
  if (!Array.isArray(result)) return [];
  const convert = (pos: any) =>
    lspToPointWithEncoding(lineForRow(pos.line) || '', pos, encoding);
  const highlights: DocumentHighlight[] = [];
  for (const item of result) {
    if (!item || !item.range || !item.range.start || !item.range.end) continue;
    highlights.push({
      range: { start: convert(item.range.start), end: convert(item.range.end) },
      kind: HIGHLIGHT_KIND[item.kind] || 'text'
    });
  }
  return highlights;
}

interface ClientLike {
  request: Function;
  getServerIdForEditor: Function;
  getPositionEncoding?: (serverId: string) => string;
}

/**
 * Highlights for the symbol at `point`, or the cursor. [] when there is no
 * server, no symbol there, or the request fails: a missing highlight is not
 * worth an error.
 */
export async function documentHighlightsFor(
  client: ClientLike,
  editor: any,
  point?: { row: number; column: number } | null
): Promise<DocumentHighlight[]> {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const pos = point || (editor.getCursorBufferPosition && editor.getCursorBufferPosition());
  if (!pos) return [];

  let response;
  try {
    response = await client.request(
      serverId,
      'textDocument/documentHighlight',
      {
        textDocument: { uri },
        position: positionFor(client, editor, serverId, pos)
      },
      5000
    );
  } catch (error) {
    return [];
  }
  if (!response || response.error) return [];

  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return normalizeDocumentHighlights(
    response.result,
    row => (editor.lineTextForBufferRow ? editor.lineTextForBufferRow(row) : ''),
    encoding
  );
}

module.exports = {
  HIGHLIGHT_KIND,
  normalizeDocumentHighlights,
  documentHighlightsFor
};
