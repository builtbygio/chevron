'use strict';

/**
 * textDocument/documentSymbol
 */

const { lspToPoint } = require('../position');
const { createSyncConverter } = require('../inbound-position');
const { pathToUri } = require('../path-uri');

const SYMBOL_KIND = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter'
};

/**
 * Flatten DocumentSymbol[] | SymbolInformation[] to a list for UI.
 * @returns {Array<{ name, kind, kindName, detail?, range: {start,end}, containerName? }>}
 */
function normalizeDocumentSymbols(result, convert = lspToPoint, uri) {
  if (!Array.isArray(result)) return [];
  const out = [];

  function walk(sym, container) {
    if (!sym || !sym.name) return;
    // DocumentSymbol
    if (sym.range || sym.selectionRange) {
      const range = sym.selectionRange || sym.range;
      out.push({
        name: sym.name,
        kind: sym.kind,
        kindName: SYMBOL_KIND[sym.kind] || 'Symbol',
        detail: sym.detail,
        range: {
          start: convert(range.start, uri),
          end: convert(range.end, uri)
        },
        containerName: container || null
      });
      if (Array.isArray(sym.children)) {
        for (const child of sym.children) {
          walk(child, sym.name);
        }
      }
      return;
    }
    // SymbolInformation
    if (sym.location && sym.location.range) {
      out.push({
        name: sym.name,
        kind: sym.kind,
        kindName: SYMBOL_KIND[sym.kind] || 'Symbol',
        range: {
          start: convert(sym.location.range.start, sym.location.uri || uri),
          end: convert(sym.location.range.end, sym.location.uri || uri)
        },
        containerName: sym.containerName || container || null
      });
    }
  }

  for (const s of result) walk(s, null);
  return out;
}

async function documentSymbols(client, editor) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return [];
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return [];
  const uri = pathToUri(filePath);
  if (!uri) return [];

  const { result, error } = await client.request(
    serverId,
    'textDocument/documentSymbol',
    { textDocument: { uri } },
    15000
  );

  if (error || !result) return [];
  // Symbols are always for the open editor, so the sync (open-buffer)
  // converter is sufficient — no disk read needed.
  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return normalizeDocumentSymbols(result, createSyncConverter(encoding), uri);
}

module.exports = {
  documentSymbols,
  normalizeDocumentSymbols,
  SYMBOL_KIND
};
