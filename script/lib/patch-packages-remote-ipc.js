'use strict';

/**
 * Apply small IPC-based replacements for remote / privileged Electron shell
 * APIs in bundled packages that we do not fully vendor. Idempotent. Run from
 * bootstrap-modern after apm install.
 *
 * Phase N2: route shell.openExternal / showItemInFolder / trash through
 * atom.applicationDelegate (main-process IPC trust boundary), and drop
 * residual electron.remote usage in tree-view cross-window DND.
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

// Route package shell.openExternal through Atom so main enforces the scheme
// allowlist (http/https/mailto). Packages cannot require src/renderer-ipc.
function routeOpenExternal(source) {
  if (
    source.includes('applicationDelegate.openExternal') &&
    !source.includes('shell.openExternal') &&
    !source.includes('electron.shell.openExternal')
  ) {
    // Already routed; still drop dead shell imports if present.
    return dropUnusedShellImports(source);
  }
  let out = source;
  out = out.replace(
    /electron\.shell\.openExternal\(/g,
    'atom.applicationDelegate.openExternal('
  );
  out = out.replace(/shell\.openExternal\(/g, 'atom.applicationDelegate.openExternal(');
  return dropUnusedShellImports(out);
}

function dropUnusedShellImports(source) {
  let out = source;
  // Any remaining `shell.` property access means the binding is still needed.
  if (/\bshell\./.test(out)) return out;
  out = out.replace(/import\s*\{\s*shell\s*\}\s*from\s*['"]electron['"]\s*;?\s*\n/, '');
  out = out.replace(/\{\s*shell\s*\}\s*=\s*require\s*['"]electron['"]\s*\n/, '');
  if (
    out.includes("import electron from 'electron'") &&
    !/\belectron\./.test(out)
  ) {
    out = out.replace(/import electron from 'electron'\s*;?\s*\n/, '');
  }
  return out;
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

// Registry + Install UI: atom.io is dead → Pulsar (also re-run after coffee transpile in script/build)
require('./patch-settings-view-registry')(repoRoot);

// atom-io-client: cache path IPC + search repository shape (registry URL patched above)
patchFile('node_modules/settings-view/lib/atom-io-client.coffee', t => {
  let out = t;

  if (!out.includes('atom-app-get-path-sync')) {
    out = out.replace(
      /@cachePath \?= path\.join\(remote\.app\.getPath\('userData'\), 'Cache', 'settings-view'\)/,
      "@cachePath ?= path.join(require('electron').ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'), 'Cache', 'settings-view')"
    );
  }

  // repository may be a string URL on some payloads; settings-view expected .url
  if (!out.includes('repositoryUrl =')) {
    out = out.replace(
      /\.map \(\{readme, metadata, downloads, stargazers_count, repository\}\) ->\n\s+Object\.assign metadata, \{readme, downloads, stargazers_count, repository: repository\.url\}/,
      `.map ({readme, metadata, downloads, stargazers_count, repository}) ->
                    repositoryUrl = if repository?.url? then repository.url else repository
                    Object.assign metadata, {readme, downloads, stargazers_count, repository: repositoryUrl}`
    );
  }

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

// --- Phase N2: settings-view openExternal → main scheme filter -------------
[
  'node_modules/settings-view/lib/package-detail-view.js',
  'node_modules/settings-view/lib/package-card.js',
  'node_modules/settings-view/lib/install-panel.js'
].forEach(rel => patchFile(rel, routeOpenExternal));

// --- Phase N2: tree-view shell + cross-window DND --------------------------
const TREE_VIEW_TRASH_OLD = `      if response is 0 # Move to Trash
        failedDeletions = []
        for selectedPath in selectedPaths
          # Don't delete entries which no longer exist. This can happen, for example, when:
          # * The entry is deleted outside of Atom before "Move to Trash" is selected
          # * A folder and one of its children are both selected for deletion,
          #   but the parent folder is deleted first
          continue unless fs.existsSync(selectedPath)

          @emitter.emit 'will-delete-entry', {pathToDelete: selectedPath}
          if shell.moveItemToTrash(selectedPath)
            @emitter.emit 'entry-deleted', {pathToDelete: selectedPath}
          else
            @emitter.emit 'delete-entry-failed', {pathToDelete: selectedPath}
            failedDeletions.push selectedPath

          if repo = repoForPath(selectedPath)
            repo.getPathStatus(selectedPath)

        if failedDeletions.length > 0
          atom.notifications.addError @formatTrashFailureMessage(failedDeletions),
            description: @formatTrashEnabledMessage()
            detail: "#{failedDeletions.join('\\n')}"
            dismissable: true

        # Focus the first parent folder
        if firstSelectedEntry = selectedEntries[0]
          @selectEntry(firstSelectedEntry.closest('.directory:not(.selected)'))
        @updateRoots() if atom.config.get('tree-view.squashDirectoryNames')
    )`;

const TREE_VIEW_TRASH_NEW = `      if response is 0 # Move to Trash
        failedDeletions = []
        # Electron removed sync shell.moveItemToTrash; trash via main IPC.
        trashNext = (index) =>
          if index >= selectedPaths.length
            if failedDeletions.length > 0
              atom.notifications.addError @formatTrashFailureMessage(failedDeletions),
                description: @formatTrashEnabledMessage()
                detail: "#{failedDeletions.join('\\n')}"
                dismissable: true
            if firstSelectedEntry = selectedEntries[0]
              @selectEntry(firstSelectedEntry.closest('.directory:not(.selected)'))
            @updateRoots() if atom.config.get('tree-view.squashDirectoryNames')
            return
          selectedPath = selectedPaths[index]
          # Don't delete entries which no longer exist (race with external delete
          # or parent folder deleted first when both selected).
          unless fs.existsSync(selectedPath)
            trashNext(index + 1)
            return
          @emitter.emit 'will-delete-entry', {pathToDelete: selectedPath}
          atom.applicationDelegate.moveItemToTrash(selectedPath).then (ok) =>
            if ok
              @emitter.emit 'entry-deleted', {pathToDelete: selectedPath}
            else
              @emitter.emit 'delete-entry-failed', {pathToDelete: selectedPath}
              failedDeletions.push selectedPath
            if repo = repoForPath(selectedPath)
              repo.getPathStatus(selectedPath)
            trashNext(index + 1)
          .catch =>
            @emitter.emit 'delete-entry-failed', {pathToDelete: selectedPath}
            failedDeletions.push selectedPath
            trashNext(index + 1)
        trashNext(0)
    )`;

function dropDeadCoffeeShellImport(source) {
  const codeOnly = source.replace(/#.*$/gm, '');
  if (/\bshell\./.test(codeOnly)) return source;
  return source
    .replace(/\{shell\} = require 'electron'\n\n/, '')
    .replace(/\{shell\} = require 'electron'\n/, '');
}

patchFile('node_modules/tree-view/lib/tree-view.coffee', t => {
  let out = t;
  if (!out.includes('applicationDelegate.moveItemToTrash')) {
    out = out.replace(
      /shell\.showItemInFolder\(/g,
      'atom.applicationDelegate.showItemInFolder('
    );
    if (out.includes(TREE_VIEW_TRASH_OLD)) {
      out = out.replace(TREE_VIEW_TRASH_OLD, TREE_VIEW_TRASH_NEW);
    } else if (out.includes('shell.moveItemToTrash')) {
      console.warn(
        'tree-view: trash block did not match exactly; shell.moveItemToTrash remains'
      );
    }
  }
  return dropDeadCoffeeShellImport(out);
});

patchFile('node_modules/tree-view/lib/root-drag-and-drop.coffee', t => {
  if (t.includes('atom-webcontents-send-to-window-id')) return t;
  let out = t;
  out = out.replace(
    /\{ipcRenderer, remote\} = require 'electron'/,
    "{ipcRenderer} = require 'electron'"
  );
  out = out.replace(
    /browserWindow = remote\.BrowserWindow\.fromId\(fromWindowId\)\n([ \t]*)browserWindow\?\.webContents\.send\('tree-view:project-folder-dropped', fromIndex\)/,
    "ipcRenderer.send('atom-webcontents-send-to-window-id', fromWindowId, 'tree-view:project-folder-dropped', fromIndex)"
  );
  out = out.replace(
    /@processId \?= atom\.getCurrentWindow\(\)\.id/,
    "@processId ?= ipcRenderer.sendSync('atom-get-current-window-id-sync')"
  );
  return out;
});

// github package: direct shell.openExternal (not via remote)
[
  'node_modules/github/lib/views/issueish-link.js',
  'node_modules/github/lib/views/actionable-review-view.js',
  'node_modules/github/lib/controllers/remote-controller.js',
  'node_modules/github/lib/controllers/issueish-list-controller.js',
  'node_modules/github/lib/controllers/issueish-searches-controller.js'
].forEach(rel => patchFile(rel, routeOpenExternal));

// github worker entry (no remote)
try {
  require('./patch-github-remote.js');
} catch (error) {
  console.error('patch-github-remote failed:', error.message);
}

console.log('package remote->IPC patches finished');
