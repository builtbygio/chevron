const path = require("path");

// Turning LSP workspace symbols into the items this package already knows how
// to render and open.
//
// A tag from ctags is `{name, file, directory, position}` where `file` is
// relative to `directory` and `directory` is a project root -- `openTag` joins
// the two. An LSP symbol is an absolute path and nothing else, so the root has
// to be found before an item can be built, and a symbol outside every root
// (a definition inside a dependency, say) still has to open.

// Longest match, so a nested root wins over the one that contains it.
function rootFor(filePath, projectPaths) {
  let best = null;
  for (const root of projectPaths || []) {
    if (!root) continue;
    if (filePath !== root && !filePath.startsWith(root + path.sep)) continue;
    if (!best || root.length > best.length) best = root;
  }
  return best;
}

// A symbol the user can act on. Returns null for one that names no file: it
// would render as a row that goes nowhere when confirmed.
function itemForSymbol(symbol, projectPaths) {
  if (!symbol || !symbol.name || !symbol.path) return null;

  const root = rootFor(symbol.path, projectPaths);
  const directory = root || path.dirname(symbol.path);
  const file = root ? path.relative(root, symbol.path) : path.basename(symbol.path);

  return {
    name: symbol.name,
    file,
    directory,
    // Null when the server sent a symbol with no range (LSP 3.17 allows it).
    // openTag then opens the file without moving the cursor, which is honest:
    // the server said which file, not which line.
    position: symbol.range ? symbol.range.start : null,
    kindName: symbol.kindName || null,
    containerName: symbol.containerName || null
  };
}

function itemsForSymbols(symbols, projectPaths) {
  const items = [];
  for (const symbol of symbols || []) {
    const item = itemForSymbol(symbol, projectPaths);
    if (item) items.push(item);
  }
  return items;
}

// Whether any running server can answer a project symbol query. Servers start
// per root and per language, so this is a question about the window, not
// about the editor in front of you.
function lspServesProjectSymbols(lsp) {
  if (!lsp || typeof lsp.projectSymbols !== "function") return false;
  if (typeof lsp.listSessions !== "function") return false;
  let sessions;
  try {
    sessions = lsp.listSessions();
  } catch (error) {
    return false;
  }
  return (
    Array.isArray(sessions) && sessions.some(session => session && session.servesWorkspaceSymbols)
  );
}

module.exports = { itemsForSymbols, itemForSymbol, rootFor, lspServesProjectSymbols };
