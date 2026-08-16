'use strict';

const path = require('path');

const CORE_MODULES = new Set([
  'electron',
  'atom',
  'chevron',
  'shell',
  'WNdb',
  'lapack',
  'remote'
]);

/**
 * electron-link exclusion list shared by generate-startup-snapshot and
 * script/snapshot-bisect.js. extraSubstrings are additional relative-path
 * needles (posix or native separators) that force a runtime require.
 */
function shouldExcludeModule({
  baseDirPath,
  requiringModulePath,
  requiredModulePath,
  extraSubstrings
}) {
  const requiringModuleRelativePath = path.relative(
    baseDirPath,
    requiringModulePath
  );
  const requiredModuleRelativePath = path.relative(
    baseDirPath,
    requiredModulePath
  );
  const isNodeProtocolBuiltin =
    typeof requiredModulePath === 'string' &&
    requiredModulePath.startsWith('node:');

  if (
    extraSubstrings &&
    extraSubstrings.length > 0 &&
    extraSubstrings.some(
      needle =>
        requiredModuleRelativePath.includes(needle) ||
        requiredModuleRelativePath.includes(needle.split('/').join(path.sep))
    )
  ) {
    return true;
  }

  return (
    requiredModulePath.endsWith('.node') ||
    isNodeProtocolBuiltin ||
    CORE_MODULES.has(requiredModulePath) ||
    requiringModuleRelativePath.endsWith(
      path.join('node_modules/xregexp/xregexp-all.js')
    ) ||
    (requiredModuleRelativePath.startsWith(path.join('..', 'src')) &&
      requiredModuleRelativePath.endsWith('-element.js')) ||
    requiredModuleRelativePath.startsWith(
      path.join('..', 'node_modules', 'dugite')
    ) ||
    requiredModuleRelativePath.startsWith(
      path.join(
        '..',
        'node_modules',
        'markdown-preview',
        'node_modules',
        'yaml-front-matter'
      )
    ) ||
    requiredModuleRelativePath.startsWith(
      path.join(
        '..',
        'node_modules',
        'markdown-preview',
        'node_modules',
        'cheerio'
      )
    ) ||
    requiredModuleRelativePath.startsWith(
      path.join(
        '..',
        'node_modules',
        'markdown-preview',
        'node_modules',
        'marked'
      )
    ) ||
    requiredModuleRelativePath.startsWith(
      path.join('..', 'node_modules', 'typescript')
    ) ||
    requiredModuleRelativePath.startsWith(
      path.join('..', 'node_modules', 'undici')
    ) ||
    requiredModuleRelativePath.includes(path.join('node_modules', 'undici')) ||
    requiredModuleRelativePath.startsWith(
      path.join('..', 'node_modules', 'encoding-sniffer')
    ) ||
    requiredModuleRelativePath.includes(
      path.join('node_modules', 'encoding-sniffer')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join(
        'node_modules',
        'coffee-script',
        'lib',
        'coffee-script',
        'register.js'
      )
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'fs-extra', 'lib', 'index.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'graceful-fs', 'graceful-fs.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'htmlparser2', 'lib', 'index.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'minimatch', 'minimatch.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'request', 'index.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'request', 'request.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'superstring', 'index.js')
    ) ||
    requiredModuleRelativePath.includes(
      path.join('node_modules', '@electron', 'remote')
    ) ||
    requiredModuleRelativePath.startsWith(
      path.join('..', 'node_modules', '@electron', 'remote')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'electron', 'index.js')
    ) ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'electron', 'index.js') ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'temp', 'lib', 'temp.js')
    ) ||
    requiredModuleRelativePath.endsWith(
      path.join('node_modules', 'parse5', 'lib', 'index.js')
    ) ||
    requiredModuleRelativePath === path.join('..', 'exports', 'atom.js') ||
    requiredModuleRelativePath === path.join('..', 'exports', 'chevron.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'src', 'electron-shims.js') ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'atom-keymap',
        'lib',
        'command-event.js'
      ) ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'babel-core', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'debug', 'node.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'git-utils', 'src', 'git.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'glob', 'glob.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'iconv-lite', 'lib', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'less', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'less', 'lib', 'less', 'fs.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'less', 'lib', 'less-node', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'lodash.isequal', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'node-fetch', 'lib', 'fetch-error.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'oniguruma', 'src', 'oniguruma.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'first-mate', 'lib', 'first-mate.js') ||
    requiredModuleRelativePath.startsWith(
      path.join('..', 'node_modules', 'first-mate', path.sep)
    ) ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'resolve', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'resolve', 'lib', 'core.js') ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'settings-view',
        'node_modules',
        'glob',
        'glob.js'
      ) ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'spell-check',
        'lib',
        'locale-checker.js'
      ) ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'spell-check',
        'lib',
        'system-checker.js'
      ) ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'spellchecker',
        'lib',
        'spellchecker.js'
      ) ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'spelling-manager',
        'node_modules',
        'natural',
        'lib',
        'natural',
        'index.js'
      ) ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'tar', 'tar.js') ||
    requiredModuleRelativePath ===
      path.join(
        '..',
        'node_modules',
        'ls-archive',
        'node_modules',
        'tar',
        'tar.js'
      ) ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'tmp', 'lib', 'tmp.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'tree-sitter', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'yauzl', 'index.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'util-deprecate', 'node.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', 'winreg', 'lib', 'registry.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', '@atom', 'fuzzy-native', 'lib', 'main.js') ||
    requiredModuleRelativePath ===
      path.join('..', 'node_modules', '@vscode', 'ripgrep', 'lib', 'index.js') ||
    requiredModuleRelativePath === path.join('..', 'src', 'startup-time.js')
  );
}

module.exports = {
  CORE_MODULES,
  shouldExcludeModule
};
