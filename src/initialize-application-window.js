const AtomEnvironment = require('./atom-environment');
const ApplicationDelegate = require('./application-delegate');
const Clipboard = require('./clipboard');
const TextEditor = require('./text-editor');

require('./text-editor-component');
require('./file-system-blob-store');
require('./native-compile-cache');
require('./compile-cache');
require('./module-cache');

// electron-link only follows static require()s. Keep this list aligned with
// first-paint packages (see SNAPSHOT_STARTUP_PACKAGES). Do not construct
// AtomEnvironment while generating the snapshot: that heap is what
// v8_context_snapshot_generator SIGTRAPs on under Electron 43 / V8 15.
if (global.isGeneratingSnapshot) {
  require('autoflow');
  require('autosave');
  require('bookmarks');
  require('command-palette');
  require('encoding-selector');
  require('git-diff');
  require('go-to-line');
  require('grammar-selector');
  require('line-ending-selector');
  require('link');
  require('notifications');
  require('status-bar');
  require('tabs');
  require('tree-view');
  require('welcome');
  require('whitespace');
  require('wrap-guide');
}

function installEnvironment() {
  if (global.chevron) return global.chevron;
  const clipboard = new Clipboard();
  TextEditor.setClipboard(clipboard);
  TextEditor.viewForItem = item => chevron.views.getView(item);

  // Chevron-only product global. The `global.atom` alias was removed in H3
  // PR 23 once the catalog conversion stream finished; nothing in core or the
  // bundled packages reads it. The Jasmine harness sets its own `window.atom`
  // (spec/jasmine-test-runner.js) and is unaffected.
  const atomEnvironment = new AtomEnvironment({
    clipboard,
    applicationDelegate: new ApplicationDelegate(),
    enablePersistence: true
  });
  global.chevron = atomEnvironment;

  TextEditor.setScheduler(global.chevron.views);
  global.chevron.preloadPackages();
  return atomEnvironment;
}

if (!global.isGeneratingSnapshot) {
  installEnvironment();
}

module.exports = function({ blobStore }) {
  installEnvironment();
  const { updateProcessEnv } = require('./update-process-env');
  const path = require('path');
  require('./window');
  const getWindowLoadSettings = require('./get-window-load-settings');
  const { ipcRenderer } = require('electron');
  const { resourcePath, devMode } = getWindowLoadSettings();
  require('./electron-shims');

  // Add application-specific exports to module search path.
  const exportsPath = path.join(resourcePath, 'exports');
  require('module').globalPaths.push(exportsPath);
  process.env.NODE_PATH = exportsPath;

  // Make React faster
  if (!devMode && process.env.NODE_ENV == null) {
    process.env.NODE_ENV = 'production';
  }

  global.chevron.initialize({
    window,
    document,
    blobStore,
    configDirPath: process.env.CHEVRON_HOME || process.env.ATOM_HOME,
    env: process.env
  });

  // Published before startEditorWindow, because that is what activates
  // packages and lsp-ui reads chevron.lsp inside its own activate(). Wiring it
  // in the .then() afterwards left the API undefined at exactly the moment a
  // package needed it, and cost lsp-ui one command registration -- silently,
  // because the throw aborted the rest of activate() and the package still
  // reported itself active.
  //
  // The client was already reachable as global.__chevronLsp, so this names an
  // existing surface rather than widening it. The two path helpers and
  // stripHtml travel with it: servers speak file:// URIs and return markup, so
  // every consumer has to convert both, and keeping them private would mean
  // each one reimplementing them.
  try {
    const lsp = require('./lsp');
    const { pathToUri, uriToPath } = require('./lsp/path-uri');
    const { stripHtml } = require('./lsp/markup');
    global.chevron.lsp = Object.assign(Object.create(lsp), {
      pathToUri,
      uriToPath,
      stripHtml
    });
    global.__chevronLsp = lsp;
  } catch (err) {
    console.error('[chevron-lsp] could not publish chevron.lsp', err);
  }

  return global.chevron.startEditorWindow().then(function() {
    // Workaround for focus getting cleared upon window creation
    const windowFocused = function() {
      window.removeEventListener('focus', windowFocused);
      setTimeout(() => document.querySelector('atom-workspace').focus(), 0);
    };
    window.addEventListener('focus', windowFocused);

    ipcRenderer.on('environment', (event, env) => updateProcessEnv(env));

    // LSP Phase 1 client (diagnostics + TypeScript when project trusted)
    try {
      require('./lsp').activate();
    } catch (err) {
      console.error('[chevron-lsp] activate failed', err);
    }
  });
};
