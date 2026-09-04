#!/usr/bin/env node
'use strict';

/**
 * Report owned forks whose GitHub repo does not match the version pinned here.
 *
 * Every fork touched during Waves 2-4 was behind npm: work had been published
 * from a throwaway clone and never pushed back, so the "pin source" repo did
 * not describe what ships. Publishing from such a repo silently reverts it —
 * tree-view was three releases and a whole .js -> .ts conversion behind.
 *
 * Needs network + `gh auth`. Not a merge gate: run it before publishing a fork.
 *
 *   node script/audit-fork-drift.js
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// Natives live under builtbygio/node-<id>.
const REPO_NAME = {
  ctags: 'node-ctags',
  keytar: 'node-keytar',
  nslog: 'node-nslog',
  pathwatcher: 'node-pathwatcher',
  spellchecker: 'node-spellchecker'
};

function pinnedPackages() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
  const out = [];
  for (const [key, spec] of Object.entries(pkg.dependencies || {})) {
    const m = String(spec).match(/^npm:@builtbygio\/([^@]+)@(.+)$/);
    if (m) out.push({ key, id: m[1], pinned: m[2] });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function repoVersion(repo) {
  try {
    const b64 = cp
      .execSync(
        `gh api repos/builtbygio/${repo}/contents/package.json --jq .content`,
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }
      )
      .trim();
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')).version;
  } catch (_) {
    return null;
  }
}

// Behind and ahead are different hazards, but "ahead" does NOT mean the repo is
// further along. fs-admin, git-utils and node-keytar each reported ahead while
// being pristine upstream Atom, carrying none of the Chevron work their
// published package ships — they simply sat on a later *upstream* release that
// Chevron never adopted. Treat any mismatch as "not reconciled" and check the
// content, not the number.
function classify(repoVersion, pinned) {
  if (repoVersion === null) return 'unreadable';
  const parts = v =>
    String(v)
      .split('.')
      .map(n => parseInt(n, 10) || 0);
  const a = parts(repoVersion);
  const b = parts(pinned);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) < (b[i] || 0)) return 'behind';
    if ((a[i] || 0) > (b[i] || 0)) return 'ahead';
  }
  return 'behind';
}

const rows = [];
for (const { id, pinned } of pinnedPackages()) {
  const repo = REPO_NAME[id] || id;
  const version = repoVersion(repo);
  if (version === pinned) continue;
  rows.push({
    repo,
    pinned,
    repoVersion: version,
    state: classify(version, pinned)
  });
}

if (rows.length === 0) {
  console.log('All owned forks match their pinned version.');
  process.exit(0);
}

const byState = s => rows.filter(r => r.state === s);
console.log(`${rows.length} owned fork(s) do not match the pinned version:\n`);
for (const state of ['behind', 'ahead', 'unreadable']) {
  const group = byState(state);
  if (!group.length) continue;
  console.log(`${state.toUpperCase()} (${group.length}):`);
  for (const r of group) {
    console.log(
      `  ${r.repo.padEnd(24)} repo=${String(r.repoVersion).padEnd(12)} pinned=${
        r.pinned
      }`
    );
  }
  console.log('');
}
if (byState('behind').length) {
  console.log(
    'BEHIND: publishing from that repo silently reverts shipped work. Copy the\n' +
      'published tarball back over the repo first, then publish from a throwaway\n' +
      'clone (see GROK.md "Publishing a fork").'
  );
}
if (byState('ahead').length) {
  console.log(
    'AHEAD: a higher number here does NOT mean the repo is further along. It has\n' +
      'meant the repo sat on a later upstream release while carrying none of the\n' +
      'Chevron work its published package ships. Diff the repo against the\n' +
      'published tarball before assuming the repo is the better source.'
  );
}
