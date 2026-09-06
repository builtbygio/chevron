'use strict';

/**
 * The chevron-lsp-* packages are community code once cpm installs them, so a
 * privileged require at load throws and takes the whole package with it.
 *
 * chevron-lsp-c did exactly that: find-clangd.js required `fs` at the top of
 * the file, and the package failed to load with
 * "[chevron-require-restrict] blocked require("fs")". A lazy require inside a
 * function is allowed — those paths run outside the editor, where there is no
 * restriction and no delegate to use instead.
 *
 * docs/reference/package-node-policy.md
 * Run: node --test script/ci/lsp-packages-no-privileged-require.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { withoutComments } = require(path.join(ROOT, 'script', 'lib', 'ipc-inventory'));

// src/preload-natives.js privilegedModuleIds, the ones a package might reach for.
const PRIVILEGED = ['fs', 'child_process', 'electron', 'net', 'os', 'path/posix'];

function lspPackageFiles() {
  const found = [];
  for (const name of fs.readdirSync(path.join(ROOT, 'packages'))) {
    if (!name.startsWith('chevron-lsp-')) continue;
    const lib = path.join(ROOT, 'packages', name, 'lib');
    if (!fs.existsSync(lib)) continue;
    for (const file of fs.readdirSync(lib)) {
      if (file.endsWith('.js')) found.push(path.join(lib, file));
    }
  }
  return found;
}

/** Requires that run when the module is loaded, not inside a function. */
function topLevelRequires(source) {
  const code = withoutComments(source);
  const found = [];
  let depth = 0;
  const pattern = /[{}]|require\(\s*'([^']+)'\s*\)/g;
  let match;
  while ((match = pattern.exec(code))) {
    if (match[0] === '{') depth++;
    else if (match[0] === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0) found.push(match[1]);
  }
  return found;
}

describe('the chevron-lsp packages load without privileged requires', () => {
  it('finds the packages to check', () => {
    const files = lspPackageFiles();
    assert.ok(files.length >= 6, `expected the lsp packages, found ${files.length} files`);
  });

  it('requires nothing privileged at module load', () => {
    const offenders = [];
    for (const file of lspPackageFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      for (const id of topLevelRequires(source)) {
        if (PRIVILEGED.includes(id)) {
          offenders.push(`${path.relative(ROOT, file)}: require('${id}')`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      'a cpm-installed package cannot require these; the load throws and the ' +
        'package never activates:\n' + offenders.join('\n')
    );
  });

  it('the scan can tell a top-level require from a lazy one', () => {
    assert.deepEqual(topLevelRequires("const fs = require('fs');"), ['fs']);
    assert.deepEqual(
      topLevelRequires("function f() {\n  const fs = require('fs');\n}"),
      []
    );
    assert.deepEqual(topLevelRequires("// const fs = require('fs');"), []);
  });
});

describe('the editor resolves clangd so the package does not have to', () => {
  it('builtin-servers knows where clangd lives', () => {
    const builtins = require(path.join(ROOT, 'src', 'lsp', 'builtin-servers'));
    assert.equal(typeof builtins.resolveSystemClangd, 'function');
    const dirs = builtins.clangdDirectories();
    assert.ok(Array.isArray(dirs) && dirs.length > 0);
    for (const dir of dirs) assert.ok(path.isAbsolute(dir), dir);
  });

  it('the package asks the service rather than the filesystem', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'packages', 'chevron-lsp-c', 'lib', 'find-clangd.js'),
      'utf8'
    );
    assert.match(source, /resolveRegistration/);
    assert.doesNotMatch(withoutComments(source), /require\(\s*'fs'\s*\)/);
  });

  it('returns nothing rather than throwing without a service', () => {
    const { findClangd } = require(
      path.join(ROOT, 'packages', 'chevron-lsp-c', 'lib', 'find-clangd')
    );
    assert.equal(findClangd(null), null);
    assert.equal(findClangd({}), null);
    assert.equal(findClangd({ resolveRegistration: () => { throw new Error('x'); } }), null);
  });
});
