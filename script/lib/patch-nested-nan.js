'use strict';

/**
 * The lockfile pins nested `nan` copies (superstring, tree-sitter, watcher,
 * text-buffer, …) at 2.17.0, which predates the V8 12 (Electron 28)
 * Local<Data> GetInternalField change and fails to compile. The root tree
 * carries nan 2.28.0, which handles it.
 *
 * Replace every nested nan older than the root copy with the root copy —
 * the generalization of patch-keytar-nan.js.
 *
 * Idempotent. Usage: node script/lib/patch-nested-nan.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);
const rootNan = path.join(repoRoot, 'node_modules', 'nan');

// A directory only counts as the nan package if it self-identifies as one —
// e.g. @atom/watcher has a *source* directory named src/nan.
function isNanPackage(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    );
    return pkg.name === 'nan' && fs.existsSync(path.join(dir, 'nan.h'));
  } catch (e) {
    return false;
  }
}

function readVersion(dir) {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
        .version || '0.0.0'
    );
  } catch (e) {
    return '0.0.0';
  }
}

function versionLess(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  }
  return false;
}

const rootVersion = readVersion(rootNan);
if (rootVersion === '0.0.0') {
  console.log('patch-nested-nan: no root nan; skipping');
  process.exit(0);
}

const SKIP_DIRS = new Set(['build', '.bin', '.git', 'test', 'tests']);

function* nanDirs(dir, depth = 0) {
  if (depth > 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return;
  }
  for (const ent of entries) {
    if (!ent.isDirectory() || SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.name === 'nan' && p !== rootNan) {
      yield p;
    } else {
      yield* nanDirs(p, depth + 1);
    }
  }
}

let replaced = 0;
for (const dir of nanDirs(path.join(repoRoot, 'node_modules'))) {
  if (!isNanPackage(dir)) continue;
  const version = readVersion(dir);
  if (!versionLess(version, rootVersion)) continue;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(rootNan, dir, { recursive: true });
  console.log(
    `patch-nested-nan: ${path.relative(repoRoot, dir)} ${version} → ${rootVersion}`
  );
  replaced++;
}
console.log(`patch-nested-nan: done (${replaced} replaced)`);
