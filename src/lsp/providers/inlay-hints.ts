'use strict';

/**
 * `textDocument/inlayHint` — the parameter names and inferred types a server
 * knows and the source does not say.
 *
 * Hints are requested for a visible range rather than a whole file: a server
 * asked for hints across ten thousand lines will compute ten thousand lines of
 * them, and the editor can only draw the ones on screen.
 *
 * docs/reference/inlay-hints.md
 */

const { pointToLsp, lspToPoint } = require('../position');
const { pathToUri } = require('../path-uri');

/** LSP InlayHintKind. */
export const HINT_KIND = {
  1: 'type',
  2: 'parameter'
};

export interface InlayHint {
  /** Where the hint is drawn, in editor coordinates. */
  position: { row: number; column: number };
  /** What is drawn. Already trimmed of the padding flags. */
  text: string;
  kind: 'type' | 'parameter' | null;
  paddingLeft: boolean;
  paddingRight: boolean;
}

/**
 * A hint's label is either a string or an array of parts. The parts carry
 * their own tooltips and locations, which nothing here draws yet, so they are
 * joined — a hint that renders as nothing is worse than one without tooltips.
 */
export function labelOf(label: any): string {
  if (typeof label === 'string') return label;
  if (Array.isArray(label)) {
    return label
      .map(part => (part && typeof part.value === 'string' ? part.value : ''))
      .join('');
  }
  return '';
}

export function normalizeInlayHints(result: any, convert: Function = lspToPoint): InlayHint[] {
  if (!Array.isArray(result)) return [];
  const hints: InlayHint[] = [];

  for (const hint of result) {
    if (!hint || !hint.position) continue;
    const text = labelOf(hint.label);
    // A server may legitimately return an empty label while resolving; there
    // is nothing to draw for it.
    if (!text) continue;

    hints.push({
      position: convert(hint.position),
      text,
      kind: HINT_KIND[hint.kind] || null,
      paddingLeft: hint.paddingLeft === true,
      paddingRight: hint.paddingRight === true
    });
  }

  return hints;
}

interface ClientLike {
  request: Function;
  getServerIdForEditor: Function;
  getPositionEncoding?: (serverId: string) => string;
}

/**
 * Hints for a range of an editor. Returns [] rather than throwing when there
 * is no server, no path, or the server does not answer: hints are an
 * enhancement, and an editor that will not open because a hint request failed
 * would be a poor trade.
 */
export async function inlayHintsFor(
  client: ClientLike,
  editor: any,
  range: any
): Promise<InlayHint[]> {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];

  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const start = range && range.start ? range.start : { row: 0, column: 0 };
  const end = range && range.end ? range.end : { row: 0, column: 0 };

  let response;
  try {
    response = await client.request(
      serverId,
      'textDocument/inlayHint',
      {
        textDocument: { uri },
        range: { start: pointToLsp(start), end: pointToLsp(end) }
      },
      10000
    );
  } catch (error) {
    return [];
  }

  if (!response || response.error || !Array.isArray(response.result)) return [];
  return normalizeInlayHints(response.result);
}

/** Whether a server said it answers inlay hints. */
export function servesInlayHints(session: any): boolean {
  if (!session || !session.capabilities) return false;
  const provider = session.capabilities.inlayHintProvider;
  return provider === true || (typeof provider === 'object' && provider !== null);
}

module.exports = {
  inlayHintsFor,
  normalizeInlayHints,
  servesInlayHints,
  labelOf,
  HINT_KIND
};
