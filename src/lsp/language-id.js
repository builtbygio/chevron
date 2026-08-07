'use strict';

/**
 * Atom grammar scope name → LSP languageId.
 */

const SCOPE_TO_LANGUAGE_ID = {
  'source.ts': 'typescript',
  'source.tsx': 'typescriptreact',
  'source.js': 'javascript',
  'source.js.jsx': 'javascriptreact',
  'source.jsx': 'javascriptreact',
  'source.flow': 'javascript',
  'source.rust': 'rust',
  'source.python': 'python',
  'source.go': 'go',
  'source.java': 'java',
  'source.json': 'json',
  'source.css': 'css',
  'source.less': 'less',
  'source.scss': 'scss',
  'source.gfm': 'markdown',
  'text.html.basic': 'html',
  'text.html.php': 'php',
  'source.ruby': 'ruby',
  'source.c': 'c',
  'source.cpp': 'cpp',
  'source.shell': 'shellscript',
  'source.yaml': 'yaml'
};

/**
 * @param {string} scopeName e.g. source.ts
 * @returns {string|null}
 */
function languageIdForScope(scopeName) {
  if (!scopeName) return null;
  if (SCOPE_TO_LANGUAGE_ID[scopeName]) return SCOPE_TO_LANGUAGE_ID[scopeName];
  // prefix match: source.ts.something
  for (const [scope, id] of Object.entries(SCOPE_TO_LANGUAGE_ID)) {
    if (scopeName === scope || scopeName.startsWith(scope + '.')) return id;
  }
  return null;
}

/**
 * Scopes that use the built-in TypeScript language server in Phase 1.
 */
const TYPESCRIPT_SCOPES = new Set([
  'source.ts',
  'source.tsx',
  'source.js',
  'source.js.jsx',
  'source.jsx',
  'source.flow'
]);

function isTypescriptScope(scopeName) {
  if (!scopeName) return false;
  if (TYPESCRIPT_SCOPES.has(scopeName)) return true;
  return (
    scopeName.startsWith('source.ts') ||
    scopeName.startsWith('source.js') ||
    scopeName.startsWith('source.tsx')
  );
}

module.exports = {
  SCOPE_TO_LANGUAGE_ID,
  languageIdForScope,
  isTypescriptScope,
  TYPESCRIPT_SCOPES
};
