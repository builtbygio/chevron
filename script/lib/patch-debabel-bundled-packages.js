'use strict';

/**
 * Option 3 (#62): apply precompiled plain JS for packageDependencies that still
 * shipped babel-prefix sources under lib/. Removes need for runtime babel-core.
 *
 * Sources: script/patches/debabelled-bundled-packages/<name>/lib/*.js
 *
 * Owned builtbygio forks are updated at source (pinned commits); this patch
 * covers remaining atom/* pins only.
 *
 * Idempotent. Usage: node script/lib/patch-debabel-bundled-packages.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);

const patchRoot = path.join(
  repoRoot,
  'script',
  'patches',
  'debabelled-bundled-packages'
);

if (!fs.existsSync(patchRoot)) {
  console.log('patch-debabel: no patch tree, skip');
  process.exit(0);
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(abs, acc);
    else if (ent.isFile() && ent.name.endsWith('.js')) acc.push(abs);
  }
  return acc;
}

let written = 0;
let skipped = 0;

for (const src of walk(patchRoot)) {
  const rel = path.relative(patchRoot, src); // e.g. archive-view/lib/foo.js
  const dest = path.join(repoRoot, 'node_modules', rel);
  if (!fs.existsSync(path.dirname(dest))) {
    console.log(`patch-debabel: skip missing package path ${rel}`);
    skipped++;
    continue;
  }
  const content = fs.readFileSync(src, 'utf8');
  const already =
    fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === content;
  if (!already) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content);
    console.log(`patch-debabel: wrote ${rel}`);
    written++;
  } else {
    console.log(`patch-debabel: ok ${rel}`);
  }
}

console.log(
  `patch-debabel: done (wrote ${written}, already-ok skipped-pkg ${skipped})`
);
