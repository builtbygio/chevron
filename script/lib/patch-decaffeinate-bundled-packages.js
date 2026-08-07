'use strict';

/**
 * Option 2 (#62): apply pre-decaffeinated JS for the four packageDependencies
 * that still ship runtime `.coffee` under `lib/`, then remove those `.coffee`
 * files so the product no longer needs `coffee-script` at runtime.
 *
 * Sources live in script/patches/decaffeinated-bundled-packages/<name>/lib/*.js
 * (converted from atom/* pins; re-run decaffeinate if pins change).
 *
 * Idempotent. Usage: node script/lib/patch-decaffeinate-bundled-packages.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);

const PACKAGES = [
  {
    name: 'autocomplete-chevron-api',
    files: ['lib/main.js', 'lib/provider.js'],
    removeCoffee: ['lib/main.coffee', 'lib/provider.coffee']
  },
  {
    name: 'autocomplete-css',
    files: ['lib/main.js', 'lib/provider.js'],
    removeCoffee: ['lib/main.coffee', 'lib/provider.coffee']
  },
  {
    name: 'bookmarks',
    files: ['lib/main.js'],
    removeCoffee: ['lib/main.coffee']
  },
  {
    name: 'wrap-guide',
    files: ['lib/main.js', 'lib/wrap-guide-element.js'],
    removeCoffee: ['lib/main.coffee', 'lib/wrap-guide-element.coffee']
  }
];

const patchRoot = path.join(
  repoRoot,
  'script',
  'patches',
  'decaffeinated-bundled-packages'
);

let written = 0;
let removed = 0;
let skipped = 0;

for (const pkg of PACKAGES) {
  const destPkg = path.join(repoRoot, 'node_modules', pkg.name);
  if (!fs.existsSync(destPkg)) {
    console.log(`patch-decaffeinate: skip missing package ${pkg.name}`);
    skipped++;
    continue;
  }

  for (const rel of pkg.files) {
    const src = path.join(patchRoot, pkg.name, rel);
    const dest = path.join(destPkg, rel);
    if (!fs.existsSync(src)) {
      console.warn(`patch-decaffeinate: missing source ${src}`);
      continue;
    }
    const content = fs.readFileSync(src, 'utf8');
    const already =
      fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') === content;
    if (!already) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
      console.log(`patch-decaffeinate: wrote ${pkg.name}/${rel}`);
      written++;
    } else {
      console.log(`patch-decaffeinate: ok ${pkg.name}/${rel}`);
    }
  }

  for (const rel of pkg.removeCoffee) {
    const coffeePath = path.join(destPkg, rel);
    if (fs.existsSync(coffeePath)) {
      fs.unlinkSync(coffeePath);
      console.log(`patch-decaffeinate: removed ${pkg.name}/${rel}`);
      removed++;
    }
  }
}

console.log(
  `patch-decaffeinate: done (wrote ${written}, removed ${removed} coffee, skipped ${skipped})`
);
