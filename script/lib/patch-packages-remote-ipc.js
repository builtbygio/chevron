'use strict';

/**
 * Apply small IPC-based replacements for remote in bundled packages
 * that we do not fully vendor. Idempotent. Run from bootstrap-modern
 * after apm install.
 *
 * Usage: node script/lib/patch-packages-remote-ipc.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));

function patchFile(rel, transform) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    console.log(`skip missing: ${rel}`);
    return;
  }
  const before = fs.readFileSync(abs, 'utf8');
  const after = transform(before);
  if (after === before) {
    console.log(`ok (already or no match): ${rel}`);
    return;
  }
  fs.writeFileSync(abs, after);
  console.log(`patched: ${rel}`);
}

patchFile('node_modules/settings-view/lib/uri-handler-panel.js', t => {
  if (t.includes('atom-is-default-protocol-client-sync')) return t;
  return t
    .replace(
      /return require\('electron'\)\.remote\.app\.isDefaultProtocolClient\('atom', process\.execPath, \['--uri-handler', '--'\]\)/,
      "const {ipcRenderer} = require('electron')\n  return ipcRenderer.sendSync('atom-is-default-protocol-client-sync', 'atom', process.execPath, ['--uri-handler', '--'])"
    )
    .replace(
      /return isSupported\(\) && require\('electron'\)\.remote\.app\.setAsDefaultProtocolClient\('atom', process\.execPath, \['--uri-handler', '--'\]\)/,
      "if (!isSupported()) return false\n  const {ipcRenderer} = require('electron')\n  return ipcRenderer.sendSync('atom-set-as-default-protocol-client-sync', 'atom', process.execPath, ['--uri-handler', '--'])"
    );
});

patchFile('node_modules/settings-view/lib/atom-io-client.coffee', t => {
  if (t.includes('atom-app-get-path-sync')) return t;
  let out = t.replace(
    /@cachePath \?= path\.join\(remote\.app\.getPath\('userData'\), 'Cache', 'settings-view'\)/,
    "@cachePath ?= path.join(require('electron').ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'), 'Cache', 'settings-view')"
  );
  // Drop unused remote import if no longer referenced
  if (!/remote\./.test(out)) {
    out = out.replace(/\{remote\} = require 'electron'\n/, '');
  }
  return out;
});

patchFile('node_modules/atom-pathspec/index.js', t => {
  if (t.includes('atom-app-get-path-sync')) return t;
  return t.replace(
    /const electron = require\("electron"\);\nconst app = electron\.remote\.app;/,
    `const {ipcRenderer} = require("electron");
const app = {
  getPath: (name) => ipcRenderer.sendSync("atom-app-get-path-sync", name)
};`
  );
});

// github worker entry (no remote)
try {
  require('./patch-github-remote.js');
} catch (error) {
  console.error('patch-github-remote failed:', error.message);
}

console.log('package remote→IPC patches finished');
