'use strict';

/**
 * Read resolved package versions from the root lockfile.
 * Prefers pnpm-lock.yaml (workspace cutover); falls back to package-lock.json.
 */

const fs = require('fs');
const path = require('path');

function findRootLock(root) {
  const pnpm = path.join(root, 'pnpm-lock.yaml');
  const npm = path.join(root, 'package-lock.json');
  if (fs.existsSync(pnpm)) return { kind: 'pnpm', filePath: pnpm };
  if (fs.existsSync(npm)) return { kind: 'npm', filePath: npm };
  throw new Error(`no lockfile in ${root}`);
}

function parseVer(version) {
  const m = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function npmEntries(lock, name) {
  const packages = lock.packages || {};
  const hits = [];
  for (const [key, value] of Object.entries(packages)) {
    if (!value || typeof value.version !== 'string') continue;
    const base = key.split('/').pop();
    if (base === name || key === `node_modules/${name}`) {
      hits.push({
        key,
        version: value.version,
        resolved: String(value.resolved || value.from || '')
      });
    }
  }
  return hits;
}

function pnpmEntries(text, name) {
  const hits = [];
  // lockfile v6:  /marked@4.3.0:
  // lockfile v9:  marked@4.3.0:  or  'marked@4.3.0':
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `(?:^|\\n) {2}(?:'|")?(?:\\/)?(${escaped}@[^\\s'"(]+)`,
    'g'
  );
  let match;
  while ((match = re.exec(text))) {
    const spec = match[1];
    const at = spec.lastIndexOf('@');
    const version = at > 0 ? spec.slice(at + 1) : '';
    hits.push({ key: spec, version, resolved: spec });
  }
  return hits;
}

function entriesFor(root, name) {
  const lock = findRootLock(root);
  if (lock.kind === 'npm') {
    return npmEntries(JSON.parse(fs.readFileSync(lock.filePath, 'utf8')), name);
  }
  return pnpmEntries(fs.readFileSync(lock.filePath, 'utf8'), name);
}

function lockText(root) {
  const lock = findRootLock(root);
  return {
    ...lock,
    text: fs.readFileSync(lock.filePath, 'utf8')
  };
}

module.exports = {
  findRootLock,
  parseVer,
  entriesFor,
  lockText
};
