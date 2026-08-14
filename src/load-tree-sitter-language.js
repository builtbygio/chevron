const fs = require('fs');
const path = require('path');
const Module = require('module');

function packageRootFromFilename(filename) {
  let dir = path.dirname(filename);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(filename);
}

function unwrapLanguage(mod) {
  if (!mod || typeof mod !== 'object') return mod;
  // Official CJS grammars (tree-sitter-c ≥0.23, …) export
  // `{ name, language, nodeTypeInfo }`. node-tree-sitter 0.25 needs
  // nodeTypeInfo on the object passed to Parser.setLanguage. Do not
  // peel that down to the raw Language.
  if (mod.nodeTypeInfo) return mod;
  if (mod.default && typeof mod.default === 'object') {
    if (mod.default.nodeTypeInfo) return mod.default;
    if (mod.default.language && typeof mod.default.language === 'object') {
      return mod.default.language;
    }
    return mod.default;
  }
  if (mod.language && typeof mod.language === 'object') return mod.language;
  return mod;
}

function isEsmRequireError(err) {
  if (!err) return false;
  if (
    err.code === 'ERR_REQUIRE_ESM' ||
    err.code === 'ERR_REQUIRE_ASYNC_MODULE'
  ) {
    return true;
  }
  return /Must use import|require\(\) of ES Module/i.test(String(err.message));
}

/**
 * Load a tree-sitter language addon named in a grammar CSON (`parser:`).
 * Official tree-sitter-* ≥0.25 may be `"type": "module"` (e.g. css 0.25.0);
 * Atom-era TreeSitterGrammar used sync require() and that throws.
 */
function loadLanguageModule(parserName, grammarFilePath) {
  const languageModulePath = Module._resolveFilename(parserName, {
    id: grammarFilePath,
    filename: grammarFilePath,
    paths: Module._nodeModulePaths(path.dirname(grammarFilePath))
  });

  let mod;
  try {
    mod = require(languageModulePath);
  } catch (err) {
    if (!isEsmRequireError(err)) throw err;
    const pkgRoot = packageRootFromFilename(languageModulePath);
    const ngbId = Module._resolveFilename('node-gyp-build', {
      id: languageModulePath,
      filename: languageModulePath,
      paths: Module._nodeModulePaths(path.dirname(languageModulePath))
    });
    mod = require(ngbId)(pkgRoot);
    // node-gyp-build returns the raw Language. Official CJS bindings attach
    // nodeTypeInfo on the same export — restore that so 0.25 can highlight.
    try {
      const typesPath = path.join(pkgRoot, 'src', 'node-types.json');
      if (mod && typeof mod === 'object' && !mod.nodeTypeInfo && fs.existsSync(typesPath)) {
        const nodeTypeInfo = JSON.parse(fs.readFileSync(typesPath, 'utf8'));
        if (!mod.language) {
          mod = { name: parserName, language: mod, nodeTypeInfo };
        } else {
          mod.nodeTypeInfo = nodeTypeInfo;
        }
      }
    } catch (_) {
      /* keep raw binding; setLanguage probe will fail closed */
    }
  }
  return unwrapLanguage(mod);
}

module.exports = {
  loadLanguageModule,
  unwrapLanguage,
  packageRootFromFilename,
  isEsmRequireError
};
