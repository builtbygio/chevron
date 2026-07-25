'use strict';

const crypto = require('crypto');
const path = require('path');

// Package .ts/.tsx transpile for compile-cache. Uses modern TypeScript
// transpileModule so owned packages can use contemporary syntax (e.g. ?.).
// Not a full typecheck — emit only, like the historical typescript-simple path.

const defaultCompilerOptions = {
  target: 6, // ES2018 (typescript.ScriptTarget.ES2018)
  module: 1, // CommonJS
  sourceMap: true,
  esModuleInterop: true,
  skipLibCheck: true,
  // Loose for mechanical package migrations; packages are not typechecked here.
  noImplicitAny: false,
  strict: false
};

let ts = null;
let typescriptVersionDir = null;

function loadTypeScript() {
  if (!ts) {
    ts = require('typescript');
  }
  return ts;
}

exports.shouldCompile = function() {
  return true;
};

exports.getCachePath = function(sourceCode) {
  if (typescriptVersionDir == null) {
    const version = require('typescript/package.json').version;
    typescriptVersionDir = path.join(
      'ts',
      createVersionAndOptionsDigest(version, defaultCompilerOptions)
    );
  }

  return path.join(
    typescriptVersionDir,
    crypto
      .createHash('sha1')
      .update(sourceCode, 'utf8')
      .digest('hex') + '.js'
  );
};

exports.compile = function(sourceCode, filePath) {
  const typescript = loadTypeScript();

  // Prefer enum values when available (keeps options accurate across TS majors).
  const compilerOptions = Object.assign({}, defaultCompilerOptions, {
    target: typescript.ScriptTarget.ES2018,
    module: typescript.ModuleKind.CommonJS
  });

  const result = typescript.transpileModule(sourceCode, {
    compilerOptions,
    fileName: filePath,
    reportDiagnostics: true
  });

  const diagnostics = result.diagnostics || [];
  if (diagnostics.length > 0) {
    const formatted = typescript.formatDiagnostics(diagnostics, {
      getCanonicalFileName: f => f,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n'
    });
    throw new Error(formatted.trim() || 'TypeScript transpile failed');
  }

  // compile-cache expects a JS string; source maps are optional for package load.
  // When sourceMap is true, transpileModule may attach sourceMapText separately.
  if (result.sourceMapText) {
    // Inline source map so stack traces stay useful without a separate file.
    const b64 = Buffer.from(result.sourceMapText, 'utf8').toString('base64');
    return (
      result.outputText.replace(/\n\/\/# sourceMappingURL=.*$/m, '') +
      '\n//# sourceMappingURL=data:application/json;base64,' +
      b64 +
      '\n'
    );
  }
  return result.outputText;
};

function createVersionAndOptionsDigest(version, options) {
  return crypto
    .createHash('sha1')
    .update('typescript', 'utf8')
    .update('\0', 'utf8')
    .update(version, 'utf8')
    .update('\0', 'utf8')
    .update(JSON.stringify(options), 'utf8')
    .digest('hex');
}
