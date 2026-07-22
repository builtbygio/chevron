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
 * Phase N2.1: settings-view avatar cache FS → main IPC
 * (atom-settings-view-cache-*).
 *
 * Phase N2.2: fuzzy-finder UI path probes → main IPC
 * (atom-fs-path-kind-sync / atom-fs-realpath-sync via applicationDelegate).
 *
 * Phase N2.3: tree-view bulk fs via fs-via-main shim + register-fs-ipc.
 * Phase N2.4: github residual remote.app / webContents / menu.popup cleanup.
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

// atom-io-client: cache path IPC + avatar cache via main (N2.1) + search shape
patchFile('node_modules/settings-view/lib/atom-io-client.coffee', t => {
  let out = t;

  if (!out.includes('atom-app-get-path-sync')) {
    out = out.replace(
      /@cachePath \?= path\.join\(remote\.app\.getPath\('userData'\), 'Cache', 'settings-view'\)/,
      "@cachePath ?= path.join(require('electron').ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'), 'Cache', 'settings-view')"
    );
  }

  // Phase N2.1: avatar cache FS → main-process IPC (confined under userData/Cache)
  // IMPORTANT: use a function replacer — AVATAR_NEW must never be a raw string
  // passed to String.replace, because `$&` / `$'` are special replacement patterns
  // and would re-insert the matched avatar block (corrupts the coffee file).
  if (!out.includes('atom-settings-view-cache-ensure')) {
    // Drop fs-plus / glob when present (pristine may also have {remote} between requires).
    out = out.replace(
      /^fs = require 'fs-plus'\npath = require 'path'\n(\{remote\} = require 'electron'\n\n)?glob = require 'glob'\nrequest = require 'request'\n/,
      "path = require 'path'\n\nrequest = require 'request'\n"
    );

    const AVATAR_OLD = `  createAvatarCache: ->
    fs.makeTree(@getCachePath())

  avatarPath: (login) ->
    path.join @getCachePath(), "#{login}-#{Date.now()}"

  cachedAvatar: (login, callback) ->
    glob @avatarGlob(login), (err, files) =>
      return callback(err) if err
      files.sort().reverse()
      for imagePath in files
        filename = path.basename(imagePath)
        [..., createdOn] = filename.split('-')
        if Date.now() - parseInt(createdOn) < @expiry
          return callback(null, imagePath)
      callback(null, null)

  avatarGlob: (login) ->
    path.join @getCachePath(), "#{login}-*([0-9])"

  fetchAndCacheAvatar: (login, callback) ->
    if not @online()
      callback(null, null)
    else
      imagePath = @avatarPath login
      requestObject = {
        url: "https://avatars.githubusercontent.com/#{login}"
        headers: {'User-Agent': navigator.userAgent}
      }
      request.head requestObject, (error, response, body) ->
        if error? or response.statusCode isnt 200 or not response.headers['content-type'].startsWith('image/')
          callback(error)
        else
          writeStream = fs.createWriteStream imagePath
          writeStream.on 'finish', -> callback(null, imagePath)
          writeStream.on 'error', (error) ->
            writeStream.close()
            try
              fs.unlinkSync imagePath if fs.existsSync imagePath
            callback(error)
          request(requestObject).pipe(writeStream)

  # The cache expiry doesn't need to be clever, or even compare dates, it just
  # needs to always keep around the newest item, and that item only. The localStorage
  # cache updates in place, so it doesn't need to be purged.

  expireAvatarCache: ->
    deleteAvatar = (child) =>
      avatarPath = path.join(@getCachePath(), child)
      fs.unlink avatarPath, (error) ->
        if error and error.code isnt 'ENOENT' # Ignore cache paths that don't exist
          console.warn("Error deleting avatar (#{error.code}): #{avatarPath}")

    fs.readdir @getCachePath(), (error, _files) ->
      _files ?= []
      files = {}
      for filename in _files
        parts = filename.split('-')
        stamp = parts.pop()
        key = parts.join('-')
        files[key] ?= []
        files[key].push "#{key}-#{stamp}"

      for key, children of files
        children.sort()
        children.pop() # keep
        # Right now a bunch of clients might be instantiated at once, so
        # we can just ignore attempts to unlink files that have already been removed
        # - this should be fixed with a singleton client
        children.forEach(deleteAvatar)

  getCachePath: ->
    @cachePath ?= path.join(require('electron').ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'), 'Cache', 'settings-view')`;

    // Keep this coffee simple: no `$&` in source, no indented .catch chains,
    // no optional chaining (CoffeeScript 1.12).
    const AVATAR_NEW = `  # Phase N2.1: avatar files only via main IPC (userData/Cache/settings-view).
  createAvatarCache: ->
    {ipcRenderer} = require 'electron'
    onRoot = (root) =>
      @cachePath = root if root
    onErr = (error) ->
      console.warn 'settings-view avatar cache ensure failed', error
    ipcRenderer.invoke('atom-settings-view-cache-ensure').then(onRoot).catch(onErr)

  avatarPath: (login) ->
    path.join @getCachePath(), "#{login}-#{Date.now()}"

  cachedAvatar: (login, callback) ->
    {ipcRenderer} = require 'electron'
    root = @getCachePath()
    handle = (names) =>
      files = []
      for name in (names or [])
        # name is "login-timestamp"; require exact login prefix + numeric stamp
        continue unless name.indexOf(login + '-') is 0
        stamp = name.substring(login.length + 1)
        continue unless /^\\d+$/.test(stamp)
        files.push path.join(root, name)
      files.sort().reverse()
      for imagePath in files
        createdOn = path.basename(imagePath).substring(login.length + 1)
        if Date.now() - parseInt(createdOn) < @expiry
          return callback(null, imagePath)
      callback(null, null)
    ipcRenderer.invoke('atom-settings-view-cache-list').then(handle).catch(callback)

  fetchAndCacheAvatar: (login, callback) ->
    if not @online()
      return callback(null, null)
    basename = "#{login}-#{Date.now()}"
    imagePath = path.join @getCachePath(), basename
    requestObject = {
      url: "https://avatars.githubusercontent.com/#{login}"
      headers: {'User-Agent': navigator.userAgent}
      encoding: null
    }
    {ipcRenderer} = require 'electron'
    request requestObject, (error, response, body) ->
      contentType = ''
      contentType = response.headers['content-type'] if response?.headers?
      if error? or not response? or response.statusCode isnt 200 or contentType.indexOf('image/') isnt 0
        return callback(error)
      onWrite = (result) ->
        if result and result.ok
          callback(null, result.path or imagePath)
        else
          errMsg = if result then result.error else 'cache-write-failed'
          callback(new Error(errMsg))
      ipcRenderer.invoke('atom-settings-view-cache-write', basename, body).then(onWrite).catch(callback)

  # The cache expiry doesn't need to be clever, or even compare dates, it just
  # needs to always keep around the newest item, and that item only. The localStorage
  # cache updates in place, so it doesn't need to be purged.

  expireAvatarCache: ->
    {ipcRenderer} = require 'electron'
    handle = (names) ->
      files = {}
      for filename in (names or [])
        parts = filename.split('-')
        stamp = parts.pop()
        key = parts.join('-')
        files[key] ?= []
        files[key].push "#{key}-#{stamp}"
      for key, children of files
        children.sort()
        children.pop() # keep newest
        for child in children
          onUnlinkErr = (error) ->
            console.warn("Error deleting avatar: #{child}", error)
          ipcRenderer.invoke('atom-settings-view-cache-unlink', child).catch(onUnlinkErr)
    onErr = (error) ->
      console.warn 'settings-view avatar cache list failed', error
    ipcRenderer.invoke('atom-settings-view-cache-list').then(handle).catch(onErr)

  getCachePath: ->
    @cachePath ?= path.join(require('electron').ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'), 'Cache', 'settings-view')`;

    if (out.includes(AVATAR_OLD)) {
      // Function replacer: do not pass AVATAR_NEW as a raw string (avoids $& / $' expansion).
      out = out.replace(AVATAR_OLD, () => AVATAR_NEW);
    } else {
      console.warn(
        'settings-view atom-io-client: avatar block did not match; N2.1 cache IPC not applied'
      );
    }
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

// Settings Install panel: user-facing links → Pulsar package explorer
patchFile('node_modules/settings-view/lib/install-panel.js', t => {
  if (t.includes('packages.pulsar-edit.dev')) return t;
  return t
    .replace(
      /this\.atomIoURL = 'https:\/\/atom\.io\/packages'/g,
      "this.atomIoURL = 'https://packages.pulsar-edit.dev/packages'"
    )
    .replace(
      /this\.atomIoURL = 'https:\/\/atom\.io\/themes'/g,
      "this.atomIoURL = 'https://packages.pulsar-edit.dev/themes'"
    )
    .replace(/>atom\.io<\/a>/, '>packages.pulsar-edit.dev</a>')
    .replace(/Packages are published to /, 'Packages are listed on ')
    .replace(/Themes are published to /g, 'Themes are listed on ');
});

patchFile('node_modules/settings-view/lib/package-card.js', t => {
  if (t.includes('packages.pulsar-edit.dev')) return t;
  return t
    .replace(
      /https:\/\/atom\.io\/users\/\$\{owner\}/g,
      'https://github.com/${owner}'
    )
    .replace(
      /https:\/\/atom\.io\/\$\{packageType\}\/\$\{this\.pack\.name\}/g,
      'https://packages.pulsar-edit.dev/${packageType}/${this.pack.name}'
    );
});

patchFile('node_modules/settings-view/lib/package-detail-view.js', t => {
  if (t.includes('packages.pulsar-edit.dev')) return t;
  return t.replace(
    /https:\/\/atom\.io\/packages\/\$\{this\.pack\.name\}/g,
    'https://packages.pulsar-edit.dev/packages/${this.pack.name}'
  );
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

// --- Phase N2.3: tree-view bulk fs-plus → main IPC (fs-via-main shim) -----
require('./write-tree-view-fs-shim')(repoRoot);

// --- Phase N2.2: fuzzy-finder UI-process fs probes → main IPC -------------
// Path crawl + ripgrep stay in atom.Task (load-paths-handler.js) — isolated.
// UI process only needed kind/realpath probes; route those through main.

function dropUnusedFsPlusImport(source) {
  // Remove `const fs = require('fs-plus')` only when no remaining `fs.` use.
  if (/\bfs\./.test(source.replace(/const fs = require\(['"]fs-plus['"]\)/, ''))) {
    return source;
  }
  return source.replace(/const fs = require\(['"]fs-plus['"]\)\s*\n/, '');
}

patchFile('node_modules/fuzzy-finder/lib/fuzzy-finder-view.js', t => {
  if (t.includes('applicationDelegate.isDirectorySync')) return t;
  let out = t.replace(
    /fs\.isDirectorySync\(uri\)/g,
    'atom.applicationDelegate.isDirectorySync(uri)'
  );
  return dropUnusedFsPlusImport(out);
});

patchFile('node_modules/fuzzy-finder/lib/git-status-view.js', t => {
  if (t.includes('applicationDelegate.isFileSync')) return t;
  let out = t.replace(
    /fs\.isFileSync\(filePath\)/g,
    'atom.applicationDelegate.isFileSync(filePath)'
  );
  return dropUnusedFsPlusImport(out);
});

patchFile('node_modules/fuzzy-finder/lib/default-file-icons.js', t => {
  if (t.includes('applicationDelegate.isSymbolicLinkSync')) return t;
  // isReadmePath / extension helpers are pure path string checks on fs-plus;
  // only isSymbolicLinkSync hits the disk — route that one.
  let out = t.replace(
    /fs\.isSymbolicLinkSync\(filePath\)/g,
    'atom.applicationDelegate.isSymbolicLinkSync(filePath)'
  );
  return out;
});

patchFile('node_modules/fuzzy-finder/lib/path-loader.js', t => {
  if (t.includes('applicationDelegate.realpathSync')) return t;
  let out = t.replace(
    /atom\.project\.getPaths\(\)\.map\(\(path\) => fs\.realpathSync\(path\)\)/,
    `atom.project.getPaths().map((p) => atom.applicationDelegate.realpathSync(p) || p)`
  );
  return dropUnusedFsPlusImport(out);
});

// github package: direct shell.openExternal (not via remote)
[
  'node_modules/github/lib/views/issueish-link.js',
  'node_modules/github/lib/views/actionable-review-view.js',
  'node_modules/github/lib/controllers/remote-controller.js',
  'node_modules/github/lib/controllers/issueish-list-controller.js',
  'node_modules/github/lib/controllers/issueish-searches-controller.js'
].forEach(rel => patchFile(rel, routeOpenExternal));

// --- Phase N2.4: github residual electron.remote → IPC / remote-compat-safe API
// Prefer explicit IPC where easy; menu.popup no longer needs BrowserWindow arg
// under remote-compat Menu (main owns the window).

function stripGithubRemoteImport(source) {
  let out = source;
  // After removing remote usages, drop dead imports.
  if (!/\bremote\./.test(out) && !/\bremote\b/.test(out.replace(/import[^;]+from ['"]electron['"]/, ''))) {
    out = out.replace(
      /import\s*\{\s*([^}]*),\s*remote\s*,\s*([^}]*)\}\s*from\s*['"]electron['"]\s*;?/,
      (m, a, b) => {
        const parts = [a, b]
          .join(',')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        if (parts.length === 0) return '';
        return `import {${parts.join(', ')}} from 'electron';`;
      }
    );
    out = out.replace(
      /import\s*\{\s*remote\s*,\s*([^}]+)\}\s*from\s*['"]electron['"]\s*;?/,
      "import {$1} from 'electron';"
    );
    out = out.replace(
      /import\s*\{\s*([^}]+),\s*remote\s*\}\s*from\s*['"]electron['"]\s*;?/,
      "import {$1} from 'electron';"
    );
    out = out.replace(
      /import\s*\{\s*remote\s*\}\s*from\s*['"]electron['"]\s*;?\s*\n/,
      ''
    );
  }
  return out;
}

patchFile('node_modules/github/lib/controllers/root-controller.js', t => {
  if (t.includes('atom-app-get-path-sync') || t.includes("applicationDelegate.appGetPath")) {
    return t;
  }
  let out = t;
  // remote.app.getPath('userData') → IPC
  if (out.includes("remote.app.getPath('userData')")) {
    out = out.replace(
      /const extensionFolder = path\.resolve\(remote\.app\.getPath\('userData'\), `extensions\/\$\{id\}`\);/,
      `const {ipcRenderer} = require('electron');\n    const extensionFolder = path.resolve(ipcRenderer.sendSync('atom-app-get-path-sync', 'userData'), \`extensions/\${id}\`);`
    );
  }
  // drop remote from import if unused
  if (!/\bremote\./.test(out)) {
    out = out.replace(
      /import \{remote\} from 'electron';\s*\n/,
      ''
    );
  }
  return out;
});

patchFile('node_modules/github/lib/worker-manager.js', t => {
  if (t.includes('atom-get-web-contents-id-sync')) return t;
  let out = t;
  out = out.replace(
    /return remote\.getCurrentWebContents\(\)\.id;/,
    "return require('electron').ipcRenderer.sendSync('atom-get-web-contents-id-sync');"
  );
  if (!/\bremote\./.test(out)) {
    out = out.replace(
      /import \{remote, ipcRenderer as ipc\} from 'electron';/,
      "import {ipcRenderer as ipc} from 'electron';"
    );
    out = out.replace(
      /import \{remote, ipcRenderer as ipc\} from "electron";/,
      'import {ipcRenderer as ipc} from "electron";'
    );
  }
  return out;
});

// menu.popup(remote.getCurrentWindow()) → menu.popup() (remote-compat Menu ignores win)
// Ensure Menu comes from electron.remote (compat), not a bare `remote` binding.
[
  'node_modules/github/lib/views/actionable-review-view.js',
  'node_modules/github/lib/views/staging-view.js',
  'node_modules/github/lib/controllers/conflict-controller.js',
  'node_modules/github/lib/controllers/issueish-list-controller.js'
].forEach(rel => {
  patchFile(rel, t => {
    let out = t;
    if (out.includes('menu.popup(remote.getCurrentWindow())')) {
      out = out.replace(/menu\.popup\(remote\.getCurrentWindow\(\)\)/g, 'menu.popup()');
    }
    // Prefer require('electron').remote for Menu (works with remote-compat).
    if (
      out.includes('const {Menu, MenuItem} = remote') &&
      !out.includes("require('electron').remote")
    ) {
      out = out.replace(
        /const \{Menu, MenuItem\} = remote;/,
        "const {Menu, MenuItem} = require('electron').remote;"
      );
    }
    // Drop unused `import {remote}` / shell+remote if remote identifier unused.
    if (!/\bremote\b/.test(out.replace(/require\('electron'\)\.remote/g, ''))) {
      out = out.replace(/import \{remote\} from 'electron';\s*\n/, '');
      out = out.replace(
        /import \{shell, remote\} from 'electron';/,
        "import {shell} from 'electron';"
      );
      out = out.replace(
        /import \{remote, shell\} from 'electron';/,
        "import {shell} from 'electron';"
      );
    }
    return out;
  });
});

// headless visibility probe — use remote-compat window proxy without importing remote by name
[
  'node_modules/github/lib/models/event-logger.js',
  'node_modules/github/lib/git-shell-out-strategy.js'
].forEach(rel => {
  patchFile(rel, t => {
    if (t.includes('atom-get-current-window-id-sync') || t.includes("require('electron').remote")) {
      // still ok if using electron.remote property (remote-compat)
    }
    if (!t.includes('remote.getCurrentWindow().isVisible()')) return t;
    let out = t.replace(
      /headless = !remote\.getCurrentWindow\(\)\.isVisible\(\);/g,
      "headless = !(require('electron').remote.getCurrentWindow().isVisible());"
    );
    if (!/\bremote\./.test(out.replace(/require\('electron'\)\.remote/g, ''))) {
      out = out.replace(/import \{remote\} from 'electron';\s*\n/, '');
    }
    return out;
  });
});

// github worker entry (no remote)
try {
  require('./patch-github-remote.js');
} catch (error) {
  console.error('patch-github-remote failed:', error.message);
}

console.log('package remote->IPC patches finished');
