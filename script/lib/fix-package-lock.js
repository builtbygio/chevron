'use strict';

/**
 * Normalize package-lock.json quirks that break apm's bundled npm 6.
 * npm 6 rewrites the lockfile on every install, so these regressions come
 * back after any successful bootstrap — run this before each apm install.
 *
 * 1. `requires` values of the form "name@git+https://…" (npm parses the
 *    whole string as a path → ENOLOCAL). Strip the redundant name prefix.
 * 2. Dead git:// protocol URLs (GitHub removed the git daemon in 2022).
 * 3. `integrity` fields on git deps — GitHub's generated tarball hashes
 *    drift over time; the pinned commit SHA already guarantees content.
 * 4. git+ssh:// GitHub URLs → git+https:// — SSH needs credentials (absent
 *    on CI runners), and npm 6 spawns git with a scrubbed environment so
 *    git-config insteadOf rewrites never apply. https works anonymously.
 *
 * Idempotent. Usage: node script/lib/fix-package-lock.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);
const lockPath = path.join(repoRoot, 'package-lock.json');
if (!fs.existsSync(lockPath)) {
  console.log('fix-package-lock: no package-lock.json, skipping');
  process.exit(0);
}

const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
let namePrefixed = 0;
let gitProtocol = 0;
let integrity = 0;

let sshUrls = 0;

function fixGitUrl(value) {
  if (typeof value !== 'string') return value;
  if (value.includes('git://github.com')) {
    gitProtocol++;
    value = value.startsWith('git://github.com')
      ? 'git+https://' + value.slice('git://'.length)
      : value.replace('git://github.com', 'git+https://github.com');
  }
  if (value.includes('git+ssh://git@github.com/')) {
    sshUrls++;
    value = value
      .split('git+ssh://git@github.com/')
      .join('git+https://github.com/');
  }
  return value;
}

function walk(node) {
  if (Array.isArray(node)) {
    node.forEach(walk);
    return;
  }
  if (!node || typeof node !== 'object') return;

  const isGitDep =
    typeof node.version === 'string' && node.version.startsWith('git');
  if (isGitDep && node.integrity) {
    delete node.integrity;
    integrity++;
  }

  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === 'string') {
      let next = fixGitUrl(value);
      // "name@git+…" spec values inside requires blocks
      if (next.startsWith(`${key}@git+`)) {
        next = next.slice(key.length + 1);
        namePrefixed++;
      }
      node[key] = next;
    } else {
      walk(value);
    }
  }
}

walk(lock);
fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
console.log(
  `fix-package-lock: ${namePrefixed} name-prefixed specs, ` +
    `${gitProtocol} git:// urls, ${sshUrls} git+ssh urls, ` +
    `${integrity} git integrity fields`
);
