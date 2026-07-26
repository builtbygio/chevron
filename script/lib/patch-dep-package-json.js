'use strict';

/**
 * Fix broken nested package.json metadata that produces Node DEP0128 warnings
 * (or broken requires) during packaging / runtime.
 *
 * Idempotent. Usage: node script/lib/patch-dep-package-json.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);

let patched = 0;

function writeIfChanged(filePath, nextText) {
  const prev = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (prev === nextText) return;
  fs.writeFileSync(filePath, nextText);
  patched++;
  console.log(
    `patch-dep-package-json: patched ${path.relative(repoRoot, filePath)}`
  );
}

// scandal@… nests isbinaryfile@2.0.4 with main pointing at a missing
// ./lib/panino.js. The package ships index.js (same as isbinaryfile@3).
const isbinaryfilePkg = path.join(
  repoRoot,
  'node_modules/scandal/node_modules/isbinaryfile/package.json'
);
if (fs.existsSync(isbinaryfilePkg)) {
  const pkg = JSON.parse(fs.readFileSync(isbinaryfilePkg, 'utf8'));
  const indexJs = path.join(path.dirname(isbinaryfilePkg), 'index.js');
  if (
    pkg.main &&
    pkg.main !== 'index.js' &&
    pkg.main !== './index.js' &&
    fs.existsSync(indexJs)
  ) {
    pkg.main = 'index.js';
    writeIfChanged(isbinaryfilePkg, `${JSON.stringify(pkg, null, 4)}\n`);
  }
}

console.log(`patch-dep-package-json: done (${patched} files)`);
