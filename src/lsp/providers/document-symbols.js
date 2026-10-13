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

/**
 * DocumentSymbol[] | SymbolInformation[] as a tree, for an outline.
 *
 * `range` is the whole symbol, which is what "the cursor is inside it" needs;
 * `selectionRange` is its name, which is where a jump should land.
 * SymbolInformation has no children, so it is nested by range: its `range` is
 * the whole symbol too, and containment is exact where `containerName` is only
 * a name, ambiguous whenever two containers share one.
 *
 * @returns {Array<{ name, kind, kindName, detail?, range, selectionRange, children }>}
 */
function normalizeDocumentSymbolTree(result, convert = lspToPoint, uri) {
  if (!Array.isArray(result)) return [];

  function node(sym, range, selectionRange, symbolUri) {
    return {
      name: sym.name,
      kind: sym.kind,
      kindName: SYMBOL_KIND[sym.kind] || 'Symbol',
      detail: sym.detail || null,
      range: {
        start: convert(range.start, symbolUri),
        end: convert(range.end, symbolUri)
      },
      selectionRange: {
        start: convert(selectionRange.start, symbolUri),
        end: convert(selectionRange.end, symbolUri)
      },
      children: []
    };
  }

  function fromDocumentSymbol(sym) {
    const range = sym.range || sym.selectionRange;
    const out = node(sym, range, sym.selectionRange || range, uri);
    if (Array.isArray(sym.children)) {
      for (const child of sym.children) {
        if (child && child.name && (child.range || child.selectionRange)) {
          out.children.push(fromDocumentSymbol(child));
        }
      }
    }
    return out;
  }

  const isDocumentSymbol = result.some(s => s && (s.range || s.selectionRange));
  if (isDocumentSymbol) {
    return result
      .filter(s => s && s.name && (s.range || s.selectionRange))
      .map(fromDocumentSymbol);
  }

  const flat = result
    .filter(s => s && s.name && s.location && s.location.range)
    .filter(s => !s.location.uri || !uri || s.location.uri === uri)
    .map(s => node(s, s.location.range, s.location.range, uri));
  return nestByRange(flat);
}

function comparePoints(a, b) {
  return a.row - b.row || a.column - b.column;
}

function nestByRange(nodes) {
  // Outermost first: earlier start, then the one that ends later.
  const sorted = nodes
    .slice()
    .sort(
      (a, b) =>
        comparePoints(a.range.start, b.range.start) ||
        comparePoints(b.range.end, a.range.end)
    );
  const roots = [];
  const stack = [];
  for (const n of sorted) {
    while (
      stack.length > 0 &&
      comparePoints(n.range.end, stack[stack.length - 1].range.end) > 0
    ) {
      stack.pop();
    }
    if (stack.length > 0) stack[stack.length - 1].children.push(n);
    else roots.push(n);
    stack.push(n);
  }
  return roots;
}

async function requestDocumentSymbols(client, editor) {
  const serverId = client.getServerIdForEditor(editor);
  if (!serverId) return null;
  const filePath = editor.getPath && editor.getPath();
  if (!filePath) return null;
  const uri = pathToUri(filePath);
  if (!uri) return null;

  const { result, error } = await client.request(
    serverId,
    'textDocument/documentSymbol',
    { textDocument: { uri } },
    15000
  );

  if (error || !result) return null;
  // Symbols are always for the open editor, so the sync (open-buffer)
  // converter is sufficient — no disk read needed.
  const encoding =
    (client.getPositionEncoding && client.getPositionEncoding(serverId)) ||
    'utf-16';
  return { result, convert: createSyncConverter(encoding), uri };
}

async function documentSymbols(client, editor) {
  const response = await requestDocumentSymbols(client, editor);
  if (!response) return [];
  return normalizeDocumentSymbols(
    response.result,
    response.convert,
    response.uri
  );
}

async function documentSymbolTree(client, editor) {
  const response = await requestDocumentSymbols(client, editor);
  if (!response) return [];
  return normalizeDocumentSymbolTree(
    response.result,
    response.convert,
    response.uri
  );
}

module.exports = {
  documentSymbols,
  documentSymbolTree,
  normalizeDocumentSymbols,
  normalizeDocumentSymbolTree,
  SYMBOL_KIND
};
