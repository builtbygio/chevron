'use strict';

/**
 * Patch the bundled github package worker entry to not use electron.remote.
 * Idempotent. Wired from bootstrap-modern / patch-packages-remote-ipc.
 *
 * Windows npm/git may leave CRLF in node_modules; always normalize before match.
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
let text = fs.readFileSync(workerPath, 'utf8').replace(/\r\n/g, '\n');
const alreadyRemotePatched = text.includes(MARKER);

// Electron 28 removed ipcRenderer.sendTo; route worker→manager messages
// through main's atom-wc-send relay (same signature after the channel arg).
// Applied even when the remote patch already ran (idempotent).
function patchSendTo(source) {
  return source
    .split('event.sender.sendTo(')
    .join(`ipc.send('atom-wc-send', `)
    .split('ipc.sendTo(')
    .join(`ipc.send('atom-wc-send', `);
}

if (alreadyRemotePatched) {
  const next = patchSendTo(text);
  if (next !== text) {
    fs.writeFileSync(workerPath, next);
    console.log('patched (sendTo->atom-wc-send): node_modules/github/lib/worker.js');
  } else {
    console.log('ok (already): node_modules/github/lib/worker.js');
  }
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
text = patchSendTo(text);

text = text.replace(
  `const sourceWebContentsId = remote.getCurrentWindow().webContents.id;`,
  `const sourceWebContentsId = ipc.sendSync('atom-get-web-contents-id-sync');`
);

// Replace the whole destroyRenderer + managerWebContents lifecycle block.
// Regex (not exact string) so minor whitespace/EOL drift still matches.
const destroyBlockRe = /const destroyRenderer = \(\) => \{[\s\S]*?const managerWebContentsId = parseInt\(query\.managerWebContentsId, 10\);[\s\S]*?window\.onbeforeunload = \(\) => \{[\s\S]*?\};\n\}/;

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

if (!destroyBlockRe.test(text)) {
  console.error('github worker.js: destroyRenderer/managerWebContents block not found');
  process.exit(1);
}

text = text.replace(destroyBlockRe, destroyBlockNew);

if (text.includes('remote.')) {
  console.error('github worker.js still references remote after patch');
  text.split('\n').forEach((line, i) => {
    if (line.includes('remote.')) console.error(`${i + 1}: ${line}`);
  });
  process.exit(1);
}

// Quick syntax sanity: balanced braces in the patched bootstrap region.
const open = (text.match(/\{/g) || []).length;
const close = (text.match(/\}/g) || []).length;
if (open !== close) {
  console.error(
    `github worker.js: brace imbalance after patch (open=${open} close=${close})`
  );
  process.exit(1);
}

fs.writeFileSync(workerPath, text);
console.log('patched: node_modules/github/lib/worker.js');
