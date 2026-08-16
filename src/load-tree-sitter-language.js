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
  // Electron / older detect-module: ESM syntax in a package without
  // `"type":"module"` is a SyntaxError, not ERR_REQUIRE_ESM.
  // tree-sitter-perl@1.2.1 is that shape (import + top-level await).
  return /Must use import|require\(\) of ES Module|Cannot use import statement|Cannot use ['"]import\.meta['"]|Unexpected token 'export'/i.test(
    String(err.message)
  );
}

function fileLooksLikeEsm(filename) {
  try {
    const head = fs.readFileSync(filename, 'utf8').slice(0, 4096);
    return /^\s*(?:import\s|export\s)/m.test(head);
  } catch (_) {
    return false;
  }
}

function hasNativeAddonMarkers(pkgRoot) {
  return (
    fs.existsSync(path.join(pkgRoot, 'binding.gyp')) ||
    fs.existsSync(path.join(pkgRoot, 'prebuilds')) ||
    fs.existsSync(path.join(pkgRoot, 'build', 'Release'))
  );
}

// node-gyp-build readdirSyncs build/Release. asar listings omit unpacked
// `*.node` files; point at app.asar.unpacked when that tree exists.
function onDiskPackageRoot(pkgRoot) {
  const asarSeg = `${path.sep}app.asar`;
  const unpackedSeg = `${path.sep}app.asar.unpacked`;
  if (pkgRoot.includes(unpackedSeg) || !pkgRoot.includes(asarSeg)) {
    return pkgRoot;
  }
  const unpacked = pkgRoot.split(asarSeg).join(unpackedSeg);
  if (
    fs.existsSync(path.join(unpacked, 'build', 'Release')) ||
    fs.existsSync(unpacked)
  ) {
    return unpacked;
  }
  return pkgRoot;
}

function loadViaNodeGypBuild(parserName, languageModulePath) {
  const pkgRoot = onDiskPackageRoot(
    packageRootFromFilename(languageModulePath)
  );
  const ngbId = Module._resolveFilename('node-gyp-build', {
    id: languageModulePath,
    filename: languageModulePath,
    paths: Module._nodeModulePaths(path.dirname(languageModulePath))
  });
  let mod = require(ngbId)(pkgRoot);
  // node-gyp-build returns the raw Language. Official CJS bindings attach
  // nodeTypeInfo on the same export — restore that so 0.25 can highlight.
  try {
    const typesPath = path.join(pkgRoot, 'src', 'node-types.json');
    const asarTypesPath = typesPath.includes(`${path.sep}app.asar.unpacked${path.sep}`)
      ? typesPath.replace(
          `${path.sep}app.asar.unpacked${path.sep}`,
          `${path.sep}app.asar${path.sep}`
        )
      : typesPath;
    const nodeTypesFile = fs.existsSync(typesPath)
      ? typesPath
      : fs.existsSync(asarTypesPath)
        ? asarTypesPath
        : null;
    if (mod && typeof mod === 'object' && !mod.nodeTypeInfo && nodeTypesFile) {
      const nodeTypeInfo = JSON.parse(fs.readFileSync(nodeTypesFile, 'utf8'));
      if (!mod.language) {
        mod = { name: parserName, language: mod, nodeTypeInfo };
      } else {
        mod.nodeTypeInfo = nodeTypeInfo;
      }
    }
  } catch (_) {
    /* keep raw binding; setLanguage probe will fail closed */
  }
  return mod;
}

/**
 * Load a tree-sitter language addon named in a grammar CSON (`parser:`).
 * Official tree-sitter-* ≥0.25 may be `"type": "module"` (e.g. css 0.25.0);
 * tree-sitter-perl is ESM syntax without that field. Atom-era
 * TreeSitterGrammar used sync require() and that throws.
 */
function loadLanguageModule(parserName, grammarFilePath) {
  const languageModulePath = Module._resolveFilename(parserName, {
    id: grammarFilePath,
    filename: grammarFilePath,
    paths: Module._nodeModulePaths(path.dirname(grammarFilePath))
  });

  let mod;
  if (fileLooksLikeEsm(languageModulePath)) {
    mod = loadViaNodeGypBuild(parserName, languageModulePath);
  } else {
    try {
      mod = require(languageModulePath);
    } catch (err) {
      const pkgRoot = packageRootFromFilename(languageModulePath);
      if (!isEsmRequireError(err) && !hasNativeAddonMarkers(pkgRoot)) {
        throw err;
      }
      mod = loadViaNodeGypBuild(parserName, languageModulePath);
    }
  }
  return unwrapLanguage(mod);
}

module.exports = {
  loadLanguageModule,
  unwrapLanguage,
  packageRootFromFilename,
  isEsmRequireError,
  fileLooksLikeEsm,
  onDiskPackageRoot
};
