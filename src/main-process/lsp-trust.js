'use strict';

/**
 * Workspace trust for language servers (LSP plan §6.2).
 * Store: $CHEVRON_HOME/trusted-projects.json
 */

const fs = require('fs');
const path = require('path');

function trustStorePath() {
  const home = process.env.CHEVRON_HOME || process.env.ATOM_HOME;
  if (!home) return null;
  return path.join(home, 'trusted-projects.json');
}

function emptyStore() {
  return { version: 1, roots: [], declined: [] };
}

function readStore() {
  const file = trustStorePath();
  if (!file || !fs.existsSync(file)) {
    return emptyStore();
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object') return emptyStore();
    const roots = Array.isArray(data.roots)
      ? data.roots.map(normalizeRoot).filter(Boolean)
      : [];
    const declined = Array.isArray(data.declined)
      ? data.declined.map(normalizeRoot).filter(Boolean)
      : [];
    return { version: 1, roots, declined };
  } catch (_) {
    return emptyStore();
  }
}

function writeStore(store) {
  const file = trustStorePath();
  if (!file) throw new Error('CHEVRON_HOME not set; cannot persist trust');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

function normalizeRoot(p) {
  if (typeof p !== 'string' || !p) return null;
  try {
    return path.resolve(fs.realpathSync(p));
  } catch (_) {
    try {
      return path.resolve(p);
    } catch (e) {
      return null;
    }
  }
}

function isTrusted(projectRoot) {
  const root = normalizeRoot(projectRoot);
  if (!root) return false;
  const { roots } = readStore();
  for (const trusted of roots) {
    if (root === trusted) return true;
    if (root.startsWith(trusted + path.sep)) return true;
  }
  return false;
}

function matchesRoot(candidate, root) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function setTrusted(projectRoot, trusted) {
  const root = normalizeRoot(projectRoot);
  if (!root) throw new Error('invalid project root');
  const store = readStore();
  const trustedSet = new Set(store.roots);
  const declinedSet = new Set(store.declined);
  if (trusted) {
    trustedSet.add(root);
    for (const r of [...declinedSet]) {
      if (matchesRoot(r, root)) declinedSet.delete(r);
    }
  } else {
    for (const r of [...trustedSet]) {
      if (matchesRoot(r, root)) trustedSet.delete(r);
    }
    declinedSet.add(root);
  }
  store.roots = [...trustedSet].sort();
  store.declined = [...declinedSet].sort();
  writeStore(store);
  return store.roots;
}

function isDeclined(projectRoot) {
  const root = normalizeRoot(projectRoot);
  if (!root) return false;
  if (isTrusted(root)) return false;
  const { declined } = readStore();
  for (const d of declined) {
    if (root === d || root.startsWith(d + path.sep)) return true;
  }
  return false;
}

/**
 * @returns {'trusted'|'declined'|'unknown'}
 */
function getTrustState(projectRoot) {
  if (isTrusted(projectRoot)) return 'trusted';
  if (isDeclined(projectRoot)) return 'declined';
  return 'unknown';
}

function listTrusted() {
  return readStore().roots.slice();
}

/**
 * Grant trust only after an explicit user confirmation in the **main**
 * process (docs/lsp-design.md §6.2: trust is a user decision, not a
 * renderer-settable flag). Revoking never prompts — removing capability is
 * always safe.
 *
 * Trusting a workspace permits language servers to execute that project's
 * toolchain (tsserver loads plugins from node_modules; rust-analyzer runs
 * build scripts), so the prompt must say so plainly.
 *
 * @param {string} projectRoot
 * @param {object} [browserWindow] parent window for the modal
 * @returns {Promise<boolean>} whether trust is now granted
 */
async function confirmAndGrantTrust(projectRoot, browserWindow) {
  if (!projectRoot) return false;
  if (isTrusted(projectRoot)) return true;

  const { dialog } = require('electron');
  const root = normalizeRoot(projectRoot);
  const { response } = await dialog.showMessageBox(browserWindow || undefined, {
    type: 'warning',
    buttons: ['Cancel', 'Trust this folder'],
    defaultId: 0,
    cancelId: 0,
    title: 'Trust this workspace?',
    message: `Enable language servers for:\n${root}`,
    detail:
      'Language servers run this project\u2019s own tooling. They can execute ' +
      'build scripts and plugins from the project (for example TypeScript ' +
      'plugins in node_modules, or Rust build scripts and proc macros).\n\n' +
      'Only trust folders whose contents you trust.'
  });

  if (response !== 1) return false;
  setTrusted(root, true);
  return true;
}

module.exports = {
  isTrusted,
  isDeclined,
  getTrustState,
  setTrusted,
  confirmAndGrantTrust,
  listTrusted,
  normalizeRoot,
  trustStorePath,
  readStore
};
