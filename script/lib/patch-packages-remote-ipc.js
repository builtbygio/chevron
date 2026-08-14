'use strict';

/**
 * Last remaining remote→IPC rewrite: unowned atom-pathspec still does
 * `electron.remote.app.getPath`. Owned settings-view / tree-view /
 * fuzzy-finder / github already ship the IPC forms.
 *
 * Retirement (do in one PR):
 *  1. Fork dmoonfire/atom-pathspec → builtbygio/atom-pathspec.
 *  2. Fold this replacement into index.js (marker `atom-app-get-path-sync`).
 *  3. Direct-pin + `overrides.atom-pathspec=$atom-pathspec` so spell-check
 *     (the only consumer) resolves the fork.
 *  4. Delete this script and its bootstrap-modern call.
 *
 * Usage: node script/lib/patch-packages-remote-ipc.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const rel = 'node_modules/atom-pathspec/index.js';
const abs = path.join(repoRoot, rel);

if (!fs.existsSync(abs)) {
  console.log(`skip missing: ${rel}`);
  process.exit(0);
}

const before = fs.readFileSync(abs, 'utf8');
if (before.includes('atom-app-get-path-sync')) {
  console.log(`ok (already): ${rel}`);
  process.exit(0);
}

const after = before.replace(
  /const electron = require\("electron"\);\nconst app = electron\.remote\.app;/,
  `const {ipcRenderer} = require("electron");
const app = {
  getPath: (name) => ipcRenderer.sendSync("atom-app-get-path-sync", name)
};`
);
if (after === before) {
  console.warn(`${rel}: expected electron.remote.app pattern not found`);
  process.exit(0);
}
fs.writeFileSync(abs, after);
console.log(`patched: ${rel}`);
