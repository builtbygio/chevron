'use strict';

/**
 * Patch the bundled github package worker entry to not use electron.remote.
 * Idempotent. Wired from bootstrap-modern / patch-packages-remote-ipc.
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const workerPath = path.join(repoRoot, 'node_modules/github/lib/worker.js');

if (!fs.existsSync(workerPath)) {
  console.log('skip missing: node_modules/github/lib/worker.js');
  process.exit(0);
}

const MARKER = 'atom-get-web-contents-id-sync';
let text = fs.readFileSync(workerPath, 'utf8');
if (text.includes(MARKER)) {
  console.log('ok (already): node_modules/github/lib/worker.js');
  process.exit(0);
}

// Replace remote-based bootstrap with IPC-only bootstrap
const oldHeader = `const {remote, ipcRenderer: ipc} = require('electron');`;
const newHeader = `const {ipcRenderer: ipc} = require('electron');`;

if (!text.includes(oldHeader)) {
  console.log('github worker.js: unexpected header, manual review needed');
  process.exit(1);
}

text = text.replace(oldHeader, newHeader);

text = text.replace(
  `const sourceWebContentsId = remote.getCurrentWindow().webContents.id;`,
  `const sourceWebContentsId = ipc.sendSync('atom-get-web-contents-id-sync');`
);

// Replace destroyRenderer / managerWebContents block
const destroyBlock = `const destroyRenderer = () => {
  if (!managerWebContents.isDestroyed()) {
    managerWebContents.removeListener('crashed', destroyRenderer);
    managerWebContents.removeListener('destroyed', destroyRenderer);
  }
  const win = remote.BrowserWindow.fromWebContents(remote.getCurrentWebContents());
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
};
const managerWebContentsId = parseInt(query.managerWebContentsId, 10);
const managerWebContents = remote.webContents.fromId(managerWebContentsId);
if (managerWebContents && !managerWebContents.isDestroyed()) {
  managerWebContents.on('crashed', destroyRenderer);
  managerWebContents.on('destroyed', destroyRenderer);
  window.onbeforeunload = () => {
    managerWebContents.removeListener('crashed', destroyRenderer);
    managerWebContents.removeListener('destroyed', destroyRenderer);
  };
}`;

const destroyBlockNew = `// Manager lifecycle is handled in main (register-renderer-ipc): if the
// manager renderer dies, worker windows are destroyed automatically.
const managerWebContentsId = parseInt(query.managerWebContentsId, 10);
const destroyRenderer = () => {
  try {
    ipc.sendSync('atom-destroy-own-window-sync');
  } catch (e) {
    /* ignore */
  }
};
window.onbeforeunload = () => {
  // no-op: main owns parent/child lifecycle
};`;

if (!text.includes('remote.webContents.fromId')) {
  console.log('github worker.js: managerWebContents block missing, skip destroy rewrite');
} else {
  text = text.replace(destroyBlock, destroyBlockNew);
  if (text.includes('remote.')) {
    // Fallback line-by-line cleanup if exact block mismatch
    text = text
      .replace(
        /const win = remote\.BrowserWindow\.fromWebContents\(remote\.getCurrentWebContents\(\)\);\s*if \(win && !win\.isDestroyed\(\)\) \{\s*win\.destroy\(\);\s*\}/s,
        `try { ipc.sendSync('atom-destroy-own-window-sync'); } catch (e) {}`
      )
      .replace(
        /const managerWebContents = remote\.webContents\.fromId\(managerWebContentsId\);[\s\S]*?window\.onbeforeunload = \(\) => \{[\s\S]*?\};/,
        `window.onbeforeunload = () => {};`
      );
  }
}

if (text.includes('remote.')) {
  console.error('github worker.js still references remote after patch');
  // show remaining
  text.split('\n').forEach((line, i) => {
    if (line.includes('remote.')) console.error(`${i + 1}: ${line}`);
  });
  process.exit(1);
}

fs.writeFileSync(workerPath, text);
console.log('patched: node_modules/github/lib/worker.js');
