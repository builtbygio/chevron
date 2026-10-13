'use strict';

// The outline as data. Both sources produce the same node, so the view draws
// a language server's symbols and a grammar's folds the same way:
//
//   { label, detail, kind, startRow, endRow, target: { row, column }, key, children }
//
// startRow..endRow is what the node covers, for "is the cursor inside it";
// `target` is where clicking it goes. `key` names a node across refreshes, so
// an entry collapsed by hand stays collapsed while the file is edited around
// it. No requires: script/ci/outline.test.js loads this under plain Node.

function fromSymbols(symbols) {
  const convert = symbol => ({
    label: symbol.name,
    detail: symbol.detail || null,
    kind: symbol.kindName || null,
    startRow: symbol.range.start.row,
    endRow: symbol.range.end.row,
    target: {
      row: symbol.selectionRange.start.row,
      column: symbol.selectionRange.start.column
    },
    children: (symbol.children || []).map(convert)
  });
  return assignKeys((symbols || []).map(convert));
}

// A comment opener on its own: a doc comment folds, but is not structure.
const COMMENT = /^(\/\*|\/\/|<!--|"""|'''|#(\s|$))/;

// Fold ranges nest by construction, since tree-sitter folds are syntax nodes.
// Two opening on the same line read as one entry, as they do in breadcrumbs,
// and a fold whose opening line has no label (a lone `{`) hands its children
// to the entry above it instead of adding a blank row.
//
// A signature or condition split over lines folds twice: once for the
// parameters, opening on `function parse(`, and once for the body, opening on
// `): Result {`. The second is labelled with a bracket, so it is merged into
// the first, which names it.
function fromFolds(ranges, lineText, labelForLine) {
  const sorted = (ranges || [])
    .filter(
      r =>
        r &&
        r.start &&
        r.end &&
        Number.isFinite(r.start.row) &&
        Number.isFinite(r.end.row)
    )
    .map(r => ({ startRow: r.start.row, endRow: r.end.row }))
    .sort((a, b) => a.startRow - b.startRow || b.endRow - a.endRow);

  const roots = [];
  const stack = [];
  let lastStart = -1;
  for (const { startRow, endRow } of sorted) {
    if (startRow === lastStart) continue;
    lastStart = startRow;
    while (stack.length > 0 && endRow > stack[stack.length - 1].endRow) {
      stack.pop();
    }
    const text = lineText(startRow) || '';
    const label = labelForLine(text);
    if (!label || COMMENT.test(label)) continue;
    const siblings =
      stack.length > 0 ? stack[stack.length - 1].children : roots;
    const opener = siblings[siblings.length - 1];
    if (/^[)\]]/.test(label) && opener && opener.endRow >= startRow - 1) {
      opener.endRow = endRow;
      stack.push(opener);
      continue;
    }
    const node = {
      label,
      detail: null,
      kind: null,
      startRow,
      endRow,
      target: { row: startRow, column: Math.max(0, text.search(/\S/)) },
      children: []
    };
    siblings.push(node);
    stack.push(node);
  }
  return assignKeys(roots);
}

// Label plus its count among same-named siblings, under the parent's key:
// overloads stay distinct, and inserting a method above another does not
// rename it.
function assignKeys(nodes, parentKey = '') {
  const seen = new Map();
  for (const node of nodes) {
    const n = seen.get(node.label) || 0;
    seen.set(node.label, n + 1);
    node.key = `${parentKey}\u0000${node.label}#${n}`;
    assignKeys(node.children, node.key);
  }
  return nodes;
}

// The nodes containing `row`, outermost first. Where one ends on the row the
// next starts on (`} else {`), the later one wins: the cursor is in the block
// that line opens.
function pathAt(nodes, row) {
  const path = [];
  let level = nodes || [];
  for (;;) {
    let found = null;
    for (const node of level) {
      if (node.startRow <= row && row <= node.endRow) found = node;
    }
    if (!found) return path;
    path.push(found);
    level = found.children;
  }
}

function countNodes(nodes) {
  let count = 0;
  for (const node of nodes || []) count += 1 + countNodes(node.children);
  return count;
}

module.exports = { fromSymbols, fromFolds, assignKeys, pathAt, countNodes };
