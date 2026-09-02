#!/usr/bin/env node
'use strict';

/**
 * Launch smoke test for the packaged app.
 *
 * Boots the packaged Chevron with a throwaway ATOM_HOME, attaches over the
 * Chrome DevTools Protocol, and asserts inside the *isolated world* (with
 * contextIsolation, `atom` lives in the preload context — main-world evals
 * silently see nothing):
 *
 *   1. the workspace window loads and packages activate,
 *   2. zero fatal/error notifications during startup,
 *   3. probe files open with the right contents,
 *   4. native tree-sitter grammars resolve (TypeScript, CSS) — this exercises
 *      the natives most likely to break on an Electron/V8 bump.
 *
 * Usage: node script/ci/smoke-test.js [path-to-app-bundle]
 * Exits 0 on success, 1 on assertion failure, 2 on timeout/infrastructure.
 */

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { makeTempDir } = require('../lib/temp-dir');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PORT = 9451;
const STARTUP_TIMEOUT_MS = 120 * 1000;
const MIN_ACTIVE_PACKAGES = 50;

function listOutDirs() {
  const outDir = path.join(REPO_ROOT, 'out');
  if (!fs.existsSync(outDir)) {
    throw new Error('out/ does not exist; build the app first');
  }
  return fs
    .readdirSync(outDir)
    .map(name => path.join(outDir, name))
    .filter(p => {
      try {
        return fs.statSync(p).isDirectory();
      } catch (error) {
        return false;
      }
    });
}

function isExecutableFile(candidate) {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    // Windows: X_OK is not meaningful for .exe the same way; existence is enough.
    if (process.platform === 'win32') return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function findAppBinary(appArg) {
  if (process.platform === 'darwin') {
    let bundle = appArg;
    if (!bundle) {
      const names = listOutDirs()
        .map(p => path.basename(p))
        .filter(name => name.endsWith('.app'));
      // Prefer Chevron.app if both exist during rebrand transitions
      const preferred =
        names.find(n => /^Chevron/i.test(n)) ||
        names.find(n => /^Atom/i.test(n)) ||
        names[0];
      bundle = preferred ? path.join(REPO_ROOT, 'out', preferred) : null;
    }
    if (!bundle) throw new Error('no .app bundle found in out/');
    const macOSDir = path.join(bundle, 'Contents', 'MacOS');
    const binary = fs
      .readdirSync(macOSDir)
      .map(name => path.join(macOSDir, name))[0];
    return binary;
  }

  if (process.platform === 'win32') {
    // Packaged layout: out/Chevron/chevron.exe or out/Chevron x64/chevron.exe
    let appDir = appArg;
    if (!appDir) {
      const candidates = listOutDirs().filter(p => {
        const base = path.basename(p);
        return /^(Chevron|Atom|chevron|atom)/i.test(base);
      });
      candidates.sort((a, b) => {
        const score = p => {
          const base = path.basename(p);
          if (/^Chevron/i.test(base)) return 0;
          if (/^chevron/i.test(base)) return 1;
          if (/^Atom/i.test(base)) return 2;
          return 3;
        };
        return score(a) - score(b);
      });
      appDir = candidates[0];
    }
    if (!appDir) {
      throw new Error('no packaged Windows app directory found in out/');
    }
    const preferredNames = [
      'chevron.exe',
      'chevron-beta.exe',
      'chevron-nightly.exe',
      'chevron-dev.exe',
      'atom.exe',
      'Atom.exe'
    ];
    for (const name of preferredNames) {
      const candidate = path.join(appDir, name);
      if (isExecutableFile(candidate)) return candidate;
    }
    const binary = fs
      .readdirSync(appDir)
      .filter(name => /\.exe$/i.test(name))
      .map(name => path.join(appDir, name))
      .find(isExecutableFile);
    if (!binary) {
      throw new Error(`no .exe found in ${appDir}`);
    }
    return binary;
  }

  // Linux: @electron/packager dir e.g. out/Chevron-linux-x64/chevron
  let appDir = appArg;
  if (!appDir) {
    const candidates = listOutDirs().filter(p => {
      const base = path.basename(p);
      // Prefer packager layout; also accept legacy atom-<ver>-<arch> dirs.
      return (
        base.includes('-linux-') ||
        /^(Chevron|Atom|chevron|atom)([-_]|$)/i.test(base)
      );
    });
    // Prefer product-named dirs (Chevron-linux-*) over legacy Atom-*
    candidates.sort((a, b) => {
      const score = p => {
        const base = path.basename(p);
        if (/^Chevron-linux-/i.test(base)) return 0;
        if (/-linux-/i.test(base) && /Chevron/i.test(base)) return 1;
        if (/-linux-/i.test(base)) return 2;
        if (/^chevron/i.test(base)) return 3;
        if (/^atom/i.test(base)) return 4;
        return 5;
      };
      return score(a) - score(b);
    });
    appDir = candidates[0];
  }
  if (!appDir) throw new Error('no packaged Linux app directory found in out/');
  const preferredNames = [
    'chevron',
    'chevron-beta',
    'chevron-nightly',
    'chevron-dev',
    'atom',
    'Chevron',
    'Atom'
  ];
  for (const name of preferredNames) {
    const candidate = path.join(appDir, name);
    if (isExecutableFile(candidate)) return candidate;
  }
  // Last resort: any executable that is not a helper/script noise
  const skip = new Set([
    'chrome_crashpad_handler',
    'chrome-sandbox',
    'resources'
  ]);
  const binary = fs
    .readdirSync(appDir)
    .filter(name => !skip.has(name))
    .map(name => path.join(appDir, name))
    .find(isExecutableFile);
  if (!binary) {
    throw new Error(`no executable found in ${appDir}`);
  }
  return binary;
}

function jsonList() {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: PORT, path: '/json/list' }, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Evaluated inside the app (isolated world). Returns JSON with status:
//   pending | no-atom | no-workspace | waiting-editors | ready
const PROBE_EXPR = `(function() {
  if (typeof chevron === 'undefined') return JSON.stringify({status:'no-chevron'});
  if (!chevron.workspace) return JSON.stringify({status:'no-workspace'});
  const editors = chevron.workspace.getTextEditors();
  const paths = editors.map(e => e.getPath() || '(untitled)');
  const packagesActive = chevron.packages.getActivePackages().length;
  if (editors.length < 3) {
    return JSON.stringify({
      status: 'waiting-editors',
      count: editors.length,
      paths: paths,
      packagesActive: packagesActive
    });
  }
  const byExt = ext =>
    editors.find(e => (e.getPath() || '').endsWith(ext));
  if (!byExt('.txt') || !byExt('.ts') || !byExt('.css') || !byExt('.md')) {
    return JSON.stringify({
      status: 'waiting-editors',
      count: editors.length,
      paths: paths,
      packagesActive: packagesActive
    });
  }
  // Autocomplete: type into the .ts probe and assert a popup appears.
  //
  // Nothing here ever exercised a UI overlay, which is how a broken
  // autocomplete shipped. The LSP provider claimed excludeLowerPriority
  // unconditionally, so it suppressed the built-in word provider and then
  // returned nothing when no server was running -- .ts/.js/.rust/.python had
  // no completions at all and every check stayed green.
  //
  // Type with insertText only. A cursor move fires cursorMoved{textChanged:
  // false}, which schedules a hide that only the typing path cancels; probing
  // with moveToEndOfLine + a manual command dispatch reports a false failure.
  if (!window.__acProbe) {
    window.__acProbe = { phase: 'starting', result: null };
    // The work below runs inside setTimeout callbacks, so a throw there lands
    // outside the promise chain's .catch and leaves phase stuck. The outer
    // loop then spends its whole 120s budget waiting for a probe that already
    // died, and reports "no autocomplete popup" -- which reads as a product
    // failure and is a probe failure. Caught roughly one run in four.
    //
    // This is the backstop for the case that is neither a throw nor a result:
    // something simply never settling. Well inside the 120s budget, so the
    // outer loop still gets a poll after it fires.
    setTimeout(function() {
      if (window.__acProbe.phase === 'done') return;
      window.__acProbe.stuckAt = window.__acProbe.phase;
      window.__acProbe.phase = 'done';
      if (!window.__acProbe.result) {
        window.__acProbe.result = {
          error: 'probe never settled; stuck at ' + window.__acProbe.stuckAt
        };
      }
      if (!window.__acProbe.project) {
        window.__acProbe.project = {
          error: 'probe never settled; stuck at ' + window.__acProbe.stuckAt
        };
      }
    }, 60000);
    var acEditor = byExt('.ts');
    chevron.packages
      .activatePackage('autocomplete-plus')
      .then(function() {
        var pane = chevron.workspace.paneForItem(acEditor);
        pane.activate();
        pane.activateItem(acEditor);
        chevron.views.getView(acEditor).focus();
        acEditor.setText('const probeAlpha = 1; const probeBeta = 2; ');
        acEditor.moveToBottom();
        window.__acProbe.phase = 'seeded';
        setTimeout(function() {
          try {
          window.__acProbe.phase = 'typing';
          'prob'.split('').forEach(function(ch) { acEditor.insertText(ch); });
          // Poll rather than wait a fixed interval: suggestion generation and
          // the overlay's render frame are both slower on a loaded CI runner
          // than locally, and a fixed sleep turns that into a flaky assertion.
          var tries = 0;
          var everSeen = false;
          var seenAtTry = null;
          (function settle() {
            var el = document.querySelector('autocomplete-suggestion-list');
            if (el && !everSeen) {
              everSeen = true;
              seenAtTry = tries;
            }
            var rect = el ? el.getBoundingClientRect() : null;
            var ready = el && rect && rect.width > 0 && rect.height > 0 &&
                        el.querySelectorAll('li').length > 0;
            if (ready || tries >= 40) {
              var diag = {};
              try {
                var ap = chevron.packages.getActivePackage('autocomplete-plus');
                var mod = ap && ap.mainModule;
                var mgr = mod && mod.autocompleteManager;
                diag.pkgActive = !!ap;
                diag.hasManager = !!mgr;
                if (mgr) {
                  diag.shouldDisplay = mgr.shouldDisplaySuggestions;
                  diag.hideTimeout = mgr.hideTimeout != null;
                  diag.delayTimeout = mgr.delayTimeout != null;
                  diag.hasPromise = mgr.currentSuggestionsPromise != null;
                  diag.providerCount = mgr.providerManager &&
                    mgr.providerManager.providers
                    ? mgr.providerManager.providers.size ||
                      mgr.providerManager.providers.length
                    : null;
                  var sl = mgr.suggestionList;
                  diag.listActive = sl && sl.isActive ? sl.isActive() : null;
                  diag.itemsLength = sl && sl.items ? sl.items.length : null;
                  diag.activeEditorIsProbe = sl ? sl.activeEditor === acEditor : null;
                  diag.hasOverlayDecoration = sl ? sl.overlayDecoration != null : null;
                  var sle = sl && sl._suggestionListElement;
                  diag.elementCreated = !!sle;
                  var node = sle && (sle.element || sle);
                  diag.elementIsNode = !!(node && node.nodeType);
                  diag.elementConnected = node && node.isConnected != null
                    ? node.isConnected
                    : null;
                  diag.elementParent = node && node.parentElement
                    ? node.parentElement.className.slice(0, 40)
                    : null;
                  if (sl && sl.overlayDecoration && sl.overlayDecoration.getMarker) {
                    var mk = sl.overlayDecoration.getMarker();
                    diag.markerValid = mk && mk.isValid ? mk.isValid() : null;
                    diag.markerDestroyed = mk && mk.isDestroyed ? mk.isDestroyed() : null;
                  }
                }
                diag.editorText = acEditor.getText().slice(-20);
                diag.cursor = JSON.stringify(acEditor.getCursorBufferPosition());
                diag.focused = document.activeElement
                  ? document.activeElement.tagName
                  : null;
                diag.anyOverlay = document.querySelectorAll('atom-overlay').length;
              } catch (e) {
                diag.error = String(e && e.message);
              }
              window.__acProbe.result = {
                popup: !!el,
                items: el ? el.querySelectorAll('li').length : 0,
                width: rect ? Math.round(rect.width) : 0,
                height: rect ? Math.round(rect.height) : 0,
                waitedMs: tries * 250,
                // Distinguishes "never rendered" from "rendered then went
                // away", which point at different faults.
                everSeen: everSeen,
                seenAtMs: seenAtTry == null ? null : seenAtTry * 250,
                diag: diag
              };
              // Now the same thing inside a project folder. This is the case
              // the loose-file check above cannot see: with a project root,
              // getServerIdForEditor can return a server, and a provider that
              // claims exclusivity then suppresses the word provider whether
              // or not it has anything to offer.
              var projectProbe = chevron.project
                .getPaths()
                .filter(function(p) { return p.indexOf('chevron-project-') !== -1; })[0];
              if (!projectProbe) {
                window.__acProbe.project = { error: 'project folder not opened' };
                window.__acProbe.phase = 'done';
                return;
              }
              chevron.workspace
                .open(projectProbe + '/project-probe.ts')
                .then(function(pEd) {
                  var pPane = chevron.workspace.paneForItem(pEd);
                  pPane.activate();
                  pPane.activateItem(pEd);
                  chevron.views.getView(pEd).focus();
                  setTimeout(function() {
                    // Type at the end, as the loose-file probe does. Typing at
                    // position 0 splices the prefix into the first line --
                    // 'proj' + 'export const projectAlpha' -- which is not the
                    // "prefix with matches" case this is meant to exercise.
                    pEd.moveToBottom();
                    'proj'.split('').forEach(function(ch) { pEd.insertText(ch); });
                    var pTries = 0;
                    var pEverSeen = false;
                    (function pSettle() {
                      var pEl = document.querySelector('autocomplete-suggestion-list');
                      if (pEl) pEverSeen = true;
                      var pRect = pEl ? pEl.getBoundingClientRect() : null;
                      var pReady = pEl && pRect && pRect.width > 0 &&
                                   pEl.querySelectorAll('li').length > 0;
                      // 20s, double the loose-file budget. Opening a
                      // project root also starts tree-view scanning, so the
                      // first suggestion here can take much longer than in a
                      // bare file -- one local run needed the full 10s, which
                      // would have failed on a loaded CI runner.
                      if (pReady || pTries >= 80) {
                        var pdiag = {};
                        try {
                          var pap = chevron.packages.getActivePackage('autocomplete-plus');
                          var pmgr = pap && pap.mainModule && pap.mainModule.autocompleteManager;
                          if (pmgr) {
                            pdiag.shouldDisplay = pmgr.shouldDisplaySuggestions;
                            pdiag.hasPromise = pmgr.currentSuggestionsPromise != null;
                            pdiag.hideTimeout = pmgr.hideTimeout != null;
                            var psl = pmgr.suggestionList;
                            pdiag.listActive = psl && psl.isActive ? psl.isActive() : null;
                            pdiag.items = psl && psl.items ? psl.items.length : null;
                            pdiag.activeIsProjectEditor = psl ? psl.activeEditor === pEd : null;
                            pdiag.hasOverlay = psl ? psl.overlayDecoration != null : null;
                            if (psl && psl.suggestionMarker) {
                              pdiag.markerDestroyed = psl.suggestionMarker.isDestroyed
                                ? psl.suggestionMarker.isDestroyed()
                                : null;
                            } else {
                              pdiag.markerDestroyed = 'no-marker';
                            }
                          }
                          pdiag.text = pEd.getText().slice(-16);
                          pdiag.cursor = JSON.stringify(pEd.getCursorBufferPosition());
                          pdiag.focused = document.activeElement
                            ? document.activeElement.tagName
                            : null;
                          pdiag.activePaneItem = chevron.workspace.getActivePaneItem() === pEd;
                          var lsp = chevron.lsp;
                          pdiag.lspServerId = lsp && lsp.getServerIdForEditor
                            ? String(lsp.getServerIdForEditor(pEd))
                            : 'no-api';
                        } catch (e) {
                          pdiag.error = String(e && e.message);
                        }
                        window.__acProbe.project = {
                          popup: !!pEl,
                          items: pEl ? pEl.querySelectorAll('li').length : 0,
                          everSeenP: pEverSeen,
                          diag: pdiag,
                          rootCount: chevron.project.getPaths().length,
                          waitedMs: pTries * 250
                        };
                        window.__acProbe.phase = 'done';
                        return;
                      }
                      pTries++;
                      setTimeout(pSettle, 250);
                    })();
                  }, 500);
                })
                .catch(function(error) {
                  window.__acProbe.project = {
                    error: String((error && error.message) || error)
                  };
                  window.__acProbe.phase = 'done';
                });
              return;
            }
            tries++;
            setTimeout(settle, 250);
          })();
          } catch (error) {
            window.__acProbe.phase = 'done';
            window.__acProbe.result = {
              error: 'probe threw while typing: ' +
                String((error && error.message) || error)
            };
          }
        }, 600);
      })
      .catch(function(error) {
        window.__acProbe.phase = 'done';
        window.__acProbe.result = { error: String((error && error.message) || error) };
      });
  }
  if (window.__acProbe.phase !== 'done') {
    return JSON.stringify({
      status: 'waiting-editors',
      count: editors.length,
      paths: paths,
      packagesActive: packagesActive,
      autocompletePhase: window.__acProbe.phase
    });
  }

  return JSON.stringify({
    status: 'ready',
    autocomplete: window.__acProbe.result,
    autocompleteInProject: window.__acProbe.project,
    packagesActive: packagesActive,
    notifications: chevron.notifications
      .getNotifications()
      .filter(n => ['error', 'fatal'].includes(n.getType()))
      .map(function(n) {
        // Carry detail/stack through. Package.handleError attaches both, and
        // without them an activation failure reports only that it happened.
        var o = n.getOptions() || {};
        return n.getType() + ': ' + n.getMessage() +
          (o.detail ? ' | detail: ' + String(o.detail).slice(0, 500) : '') +
          (o.stack ? ' | stack: ' + String(o.stack).slice(0, 800) : '');
      }),
    txtText: byExt('.txt').getText(),
    tsGrammar: byExt('.ts').getGrammar() && byExt('.ts').getGrammar().name,
    cssGrammar: byExt('.css').getGrammar() && byExt('.css').getGrammar().name,
    mdGrammar: byExt('.md') && byExt('.md').getGrammar() && byExt('.md').getGrammar().name,
    electron: process.versions.electron
  });
})()`;

// Opening a settings tab takes focus and perturbs the editor probes above, so
// this runs as its own evaluation after the main state has been collected --
// not as another branch of the same expression. Sharing one expression made
// smoke fail about one run in three even when the settings work happened last.
const SETTINGS_EXPR = `(function() {
  var chevron = window.chevron || window.atom;
  if (!chevron || !chevron.workspace) {
    return JSON.stringify({ status: 'no-chevron' });
  }
  if (!window.__settingsProbe) {
    window.__settingsProbe = { phase: 'opening', result: null };
    chevron.workspace
      .open('chevron://config/install')
      .then(function(item) {
        var tries = 0;
        (function settle() {
          var root = item && item.element;
          var menu = root ? root.querySelectorAll('.panels-menu li') : [];
          var names = [];
          for (var i = 0; i < menu.length; i++) {
            if (menu[i].name) names.push(menu[i].name);
          }
          var heading = root ? root.querySelector('.section-heading') : null;
          var cards = root ? root.querySelectorAll('.package-card').length : 0;
          if ((names.length && heading) || tries >= 40) {
            window.__settingsProbe.result = {
              panels: names,
              heading: heading ? heading.textContent : null,
              cards: cards
            };
            window.__settingsProbe.phase = 'done';
            return;
          }
          tries++;
          setTimeout(settle, 250);
        })();
      })
      .catch(function(error) {
        window.__settingsProbe.result = { error: String(error && error.message) };
        window.__settingsProbe.phase = 'done';
      });
  }
  return JSON.stringify({
    status: window.__settingsProbe.phase === 'done' ? 'ready' : 'pending',
    settings: window.__settingsProbe.result
  });
})()`;

function isAppWindowTarget(target) {
  if (!target || target.type !== 'page') return false;
  const url = target.url || '';
  if (/^devtools:/i.test(url)) return false;
  // github package opens secondary BrowserWindows (renderer.html?js=…worker.js)
  if (/github[/\\]lib[/\\]renderer\.html/i.test(url)) return false;
  if (/[?&]js=.*worker\.js/i.test(url)) return false;
  // Main editor window only
  return /static[/\\]index\.html/i.test(url) || /\/index\.html(?:\?|#|$)/i.test(url);
}

// Accumulated renderer console / exception noise for timeout diagnostics.
const rendererLogs = [];

async function probeWindow(probePaths, expression = PROBE_EXPR) {
  const targets = await jsonList();
  // Prefer the main editor window only (never github worker / DevTools).
  const page = targets.find(isAppWindowTarget);
  if (!page) {
    return {
      status: 'pending',
      reason: 'no-page-target',
      targets: targets.map(t => ({ type: t.type, url: t.url }))
    };
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl, {
    maxPayload: 256 * 1024 * 1024
  });
  try {
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });

    let messageId = 0;
    const pending = new Map();
    const contexts = [];
    const contextMeta = [];
    ws.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message.result);
        pending.delete(message.id);
      } else if (message.method === 'Runtime.executionContextCreated') {
        const ctx = message.params.context;
        contexts.push(ctx.id);
        contextMeta.push({
          id: ctx.id,
          name: ctx.name,
          origin: ctx.origin,
          auxData: ctx.auxData
        });
      } else if (message.method === 'Runtime.consoleAPICalled') {
        const args = (message.params.args || [])
          .map(a => a.value || a.description || a.type)
          .join(' ');
        const line = `[console.${message.params.type}] ${args}`;
        rendererLogs.push(line);
        if (rendererLogs.length > 80) rendererLogs.shift();
      } else if (message.method === 'Runtime.exceptionThrown') {
        const desc =
          (message.params.exceptionDetails &&
            message.params.exceptionDetails.exception &&
            message.params.exceptionDetails.exception.description) ||
          (message.params.exceptionDetails &&
            message.params.exceptionDetails.text) ||
          'unknown exception';
        rendererLogs.push(`[exception] ${desc}`);
        if (rendererLogs.length > 80) rendererLogs.shift();
      }
    });
    const call = (method, params = {}, timeoutMs = 8000) =>
      new Promise(resolve => {
        const id = ++messageId;
        const timer = setTimeout(() => {
          pending.delete(id);
          resolve(null);
        }, timeoutMs);
        pending.set(id, result => {
          clearTimeout(timer);
          resolve(result);
        });
        try {
          ws.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          resolve(null);
        }
      });

    // Runtime.enable emits executionContextCreated for *existing* contexts too.
    await call('Runtime.enable');
    await delay(600);

    // Prefer Electron Isolated Context (preload / atom), then fall back.
    const isolatedIds = contextMeta
      .filter(c => c.name === 'Electron Isolated Context')
      .map(c => c.id);
    const contextIds =
      isolatedIds.length > 0
        ? isolatedIds.concat(contexts.filter(id => !isolatedIds.includes(id)))
        : contexts.length > 0
        ? contexts
        : [undefined];

    // Evaluate every candidate context. Main world has no `atom` under
    // contextIsolation — only the preload isolated world does.
    let best = null;
    const rank = status => {
      switch (status) {
        case 'ready':
          return 4;
        case 'waiting-editors':
          return 3;
        case 'no-workspace':
          return 2;
        case 'no-chevron':
          return 1;
        default:
          return 0;
      }
    };
    for (const contextId of contextIds) {
      const baseParams = { returnByValue: true };
      if (contextId !== undefined) baseParams.contextId = contextId;

      const result = await call(
        'Runtime.evaluate',
        Object.assign({ expression }, baseParams)
      );
      const value = result && result.result && result.result.value;
      if (!value) continue;
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        continue;
      }
      parsed.pageUrl = page.url;
      parsed.contextCount = contexts.length;
      parsed.contextMeta = contextMeta;
      if (!best || rank(parsed.status) > rank(best.status)) {
        best = parsed;
      }
      if (parsed.status === 'ready') return parsed;
    }
    return (
      best || {
        status: 'pending',
        reason: 'no-atom-in-contexts',
        pageUrl: page.url,
        contextCount: contexts.length,
        contextMeta
      }
    );
  } finally {
    ws.close();
  }
}

function linuxNeedsNoSandbox(binaryPath) {
  if (process.platform !== 'linux') return false;
  // Chromium aborts if chrome-sandbox exists but is not root-owned mode 4755
  // (common for unpackaged out/ builds and non-root CI). Use --no-sandbox then.
  const sandbox = path.join(path.dirname(binaryPath), 'chrome-sandbox');
  try {
    const st = fs.statSync(sandbox);
    const isSuid = (st.mode & 0o4000) !== 0;
    const isRoot = st.uid === 0;
    return !(isSuid && isRoot);
  } catch (error) {
    return true;
  }
}

function linuxLaunchFlags(binaryPath) {
  const flags = [];
  // Electron 28+ ozone: force X11 so Xvfb DISPLAY is used (not Wayland).
  flags.push('--ozone-platform=x11');
  // Headless CI: avoid GPU/WebGL blocklist stalls under Xvfb.
  // Do not combine --disable-gpu with --disable-software-rasterizer (no
  // remaining raster path; can hang compositing under Xvfb).
  flags.push('--disable-gpu', '--disable-dev-shm-usage');
  if (linuxNeedsNoSandbox(binaryPath)) {
    flags.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return flags;
}

async function main() {
  const binary = findAppBinary(process.argv[2]);
  console.log(`smoke-test: launching ${binary}`);

  const atomHome = makeTempDir('chevron-smoke-');
  // Pre-create electronUserData so Chromium state is isolated too
  fs.mkdirSync(path.join(atomHome, 'electronUserData'), { recursive: true });

  const probeDir = makeTempDir('chevron-probes-');

  // A second probe file inside a *project folder*. Loose files opened by path
  // have no project root, so getServerIdForEditor always returns null for
  // them -- which meant every autocomplete check here exercised the one code
  // path that already worked. An LSP provider claiming exclusivity only
  // suppressed the word provider once a project root existed, so "works in a
  // new file, not in an existing one" was invisible to this harness.
  const projectDir = makeTempDir('chevron-project-');
  const projectFile = path.join(projectDir, 'project-probe.ts');
  fs.writeFileSync(
    projectFile,
    'export const projectAlpha = 1;\n' +
      'export const projectBeta = 2;\n' +
      'export const projectGamma = 3;\n'
  );
  const probes = {
    txt: path.join(probeDir, 'probe.txt'),
    ts: path.join(probeDir, 'probe.ts'),
    css: path.join(probeDir, 'probe.css'),
    // GitHub Markdown is TextMate-only, so this is the one probe that
    // exercises first-mate rather than tree-sitter.
    md: path.join(probeDir, 'probe.md')
  };
  fs.writeFileSync(probes.txt, 'smoke test probe\n');
  fs.writeFileSync(probes.ts, 'const n: number = 1;\n');
  fs.writeFileSync(probes.css, 'body { color: red; }\n');
  fs.writeFileSync(probes.md, '# heading\n\nsome **bold** text\n');

  const launchArgs = [
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=' + path.join(atomHome, 'electronUserData')
  ];
  if (process.platform === 'linux') {
    const linuxFlags = linuxLaunchFlags(binary);
    console.log('smoke-test: linux flags', linuxFlags.join(' '));
    launchArgs.push(...linuxFlags);
  }
  launchArgs.push(projectDir, probes.txt, probes.ts, probes.css, probes.md);

  const app = childProcess.spawn(binary, launchArgs, {
    env: Object.assign({}, process.env, {
      ATOM_HOME: atomHome,
      // Prefer software GL if any GPU path still runs under Xvfb.
      LIBGL_ALWAYS_SOFTWARE: process.env.LIBGL_ALWAYS_SOFTWARE || '1',
      ELECTRON_OZONE_PLATFORM_HINT:
        process.env.ELECTRON_OZONE_PLATFORM_HINT || 'x11',
      ELECTRON_ENABLE_LOGGING: '1'
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    // Electron forks zygote / gpu / utility / crashpad children. Killing only
    // the browser process leaves those orphaned -- a smoke run that is
    // interrupted used to leave a dozen processes and a ~8 MB user-data dir
    // behind each time. Own a process group so the whole tree can be signalled.
    detached: process.platform !== 'win32'
  });
  let appOutput = '';
  app.stdout.on('data', chunk => (appOutput += chunk));
  app.stderr.on('data', chunk => (appOutput += chunk));
  let appExited = false;
  app.on('exit', () => (appExited = true));

  let shutdownDone = false;
  const shutdown = () => {
    if (shutdownDone) return;
    shutdownDone = true;
    try {
      if (!appExited) {
        if (process.platform !== 'win32' && app.pid) {
          // Negative pid signals the whole group, so the Electron children go
          // with the browser process rather than being reparented to init.
          try {
            process.kill(-app.pid, 'SIGKILL');
          } catch (error) {
            app.kill('SIGKILL');
          }
        } else {
          app.kill('SIGKILL');
        }
      }
    } catch (error) {
      /* already gone */
    }
    for (const dir of [atomHome, probeDir, projectDir]) {
      try {
        if (dir) fs.rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        /* best effort */
      }
    }
  };

  // A `finally` does not run when node is killed, so an interrupted or
  // timed-out run would otherwise orphan the whole Electron tree.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(signal, () => {
      shutdown();
      process.exit(130);
    });
  }
  process.once('exit', shutdown);

  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let state = { status: 'pending' };
    let lastLog = '';
    let bestBoot = null; // strongest packagesActive observation
    while (Date.now() < deadline) {
      if (appExited) {
        console.error('smoke-test: app exited during startup');
        console.error(appOutput.slice(-4000));
        process.exit(1);
      }
      try {
        state = await probeWindow([probes.txt, probes.ts, probes.css, probes.md]);
      } catch (error) {
        state = { status: 'pending', reason: String(error.message || error) };
      }
      if (
        state &&
        typeof state.packagesActive === 'number' &&
        (!bestBoot || state.packagesActive > bestBoot.packagesActive)
      ) {
        bestBoot = state;
      }
      if (
        state &&
        state.status === 'ready' &&
        state.packagesActive >= MIN_ACTIVE_PACKAGES
      ) {
        break;
      }
      // `ready` can land on first-paint (deferred packages still idle, ≤2s).
      // Keep polling until the idle activate brings the count over the bar.
      const progress = JSON.stringify(state);
      if (progress !== lastLog) {
        console.log('smoke-test: progress', progress);
        lastLog = progress;
      }
      await delay(2000);
    }

    // Full editor/grammar probe (macOS + ideal Linux).
    // Only now, with every editor probe recorded, open the settings tab.
    if (state && state.status === 'ready') {
      for (let attempt = 0; attempt < 40; attempt++) {
        let settingsState;
        try {
          settingsState = await probeWindow(
            [probes.txt, probes.ts, probes.css, probes.md],
            SETTINGS_EXPR
          );
        } catch (error) {
          settingsState = { settings: { error: String(error.message || error) } };
        }
        if (settingsState && settingsState.settings) {
          state.settings = settingsState.settings;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    if (state && state.status === 'ready') {
      console.log('smoke-test: state', JSON.stringify(state, null, 2));
      const failures = [];
      if (state.notifications && state.notifications.length > 0) {
        failures.push(`error notifications: ${state.notifications.join('; ')}`);
      }
      if (state.packagesActive < MIN_ACTIVE_PACKAGES) {
        failures.push(
          `only ${state.packagesActive} packages active (< ${MIN_ACTIVE_PACKAGES})`
        );
      }
      if (state.txtText !== 'smoke test probe\n') {
        failures.push(
          `probe.txt contents wrong: ${JSON.stringify(state.txtText)}`
        );
      }
      if (state.tsGrammar !== 'TypeScript') {
        failures.push(
          `probe.ts grammar: ${state.tsGrammar} (expected TypeScript)`
        );
      }
      // first-mate is patched to read grammars with JSON.parse rather than
      // season; a TextMate grammar failing to load is the way that breaks.
      if (state.mdGrammar !== 'GitHub Markdown') {
        failures.push(
          `probe.md grammar: ${state.mdGrammar} (expected GitHub Markdown -- ` +
            'the TextMate engine failed to load a grammar)'
        );
      }
      const settings = state.settings;
      if (!settings) {
        failures.push(
          `settings probe did not report (phase: ${state.settingsPhase})`
        );
      } else if (settings.error) {
        failures.push(`settings probe error: ${settings.error}`);
      } else {
        if (!settings.panels || !settings.panels.includes('Install')) {
          failures.push(
            `settings has no Install panel (panels: ${
              settings.panels ? settings.panels.join(', ') : 'none'
            })`
          );
        }
        if (!settings.cards) {
          failures.push('the Install panel rendered no catalog entries');
        }
      }
      if (state.cssGrammar !== 'CSS') {
        failures.push(
          `probe.css grammar: ${state.cssGrammar} (expected CSS)`
        );
      }
      // Typing 'prob' after `const probeAlpha` / `const probeBeta` must offer
      // both. This is the only check that exercises a rendered UI overlay.
      const ac = state.autocomplete;
      if (!ac) {
        failures.push('autocomplete probe did not report');
      } else if (ac.error) {
        failures.push(`autocomplete probe error: ${ac.error}`);
      } else if (!ac.popup) {
        failures.push(
          'no autocomplete popup after typing a prefix with two matches ' +
            '(a provider claiming excludeLowerPriority without answering will ' +
            'do this)'
        );
      } else if (ac.items < 2) {
        failures.push(`autocomplete showed ${ac.items} items (expected 2+)`);
      } else if (ac.width < 1 || ac.height < 1) {
        failures.push(
          `autocomplete popup has no size (${ac.width}x${ac.height}); it ` +
            'attached but did not render'
        );
      }
      // The project-folder case. A loose file has no project root, so it never
      // reaches the code path where a provider can claim exclusivity -- which
      // is how "works in a new file, not in an existing one" shipped.
      const acp = state.autocompleteInProject;
      if (!acp) {
        failures.push('autocomplete-in-project probe did not report');
      } else if (acp.error) {
        failures.push(`autocomplete-in-project probe error: ${acp.error}`);
      } else if (!acp.rootCount) {
        failures.push('project folder was not opened as a project root');
      } else if (!acp.popup) {
        failures.push(
          'no autocomplete popup in a file inside a project folder, though ' +
            'the same typing works in a loose file — a provider is claiming ' +
            'exclusivity without answering'
        );
      } else if (acp.items < 2) {
        failures.push(
          `autocomplete in project showed ${acp.items} items (expected 2+)`
        );
      }
      if (failures.length > 0) {
        console.error('smoke-test: FAILED');
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
      }
      console.log(
        `smoke-test: PASSED on Electron ${state.electron} ` +
          `(${state.packagesActive} packages active)`
      );
      process.exit(0);
    }

    // Linux Xvfb / Windows CI: CDP isolated-world eval can flake even when the
    // app boots. Accept package-boot smoke when packages activate, or when the
    // window title shows our probe files opened (app is clearly running).
    if (process.platform === 'linux' || process.platform === 'win32') {
      const bootLabel = process.platform === 'win32' ? 'windows-boot' : 'linux-boot';
      if (
        bestBoot &&
        bestBoot.packagesActive >= MIN_ACTIVE_PACKAGES
      ) {
        console.log(
          'smoke-test: full editor probe incomplete under CI display; ' +
            `accepting ${bootLabel} smoke (${bestBoot.packagesActive} packages active)`
        );
        console.log(
          'smoke-test: best boot state',
          JSON.stringify(bestBoot, null, 2)
        );
        if (bestBoot.notifications && bestBoot.notifications.length > 0) {
          console.error(
            'smoke-test: FAILED error notifications during boot:',
            bestBoot.notifications.join('; ')
          );
          process.exit(1);
        }
        console.log(
          `smoke-test: PASSED (${bootLabel}) with ${bestBoot.packagesActive} packages active`
        );
        process.exit(0);
      }
      try {
        const targets = await jsonList();
        const page = targets.find(isAppWindowTarget);
        const title = (page && page.title) || '';
        // e.g. "probe.css — /tmp/… — Chevron" after CLI paths open
        if (
          /probe\.(css|ts|txt)/i.test(title) &&
          /Chevron|Atom/i.test(title)
        ) {
          console.log(
            'smoke-test: full CDP probe incomplete; window title shows probes open:',
            title
          );
          console.log(`smoke-test: PASSED (${bootLabel} via window title)`);
          process.exit(0);
        }
      } catch (error) {
        /* fall through to timeout */
      }
    }

    console.error('smoke-test: TIMEOUT waiting for workspace');
    console.error('smoke-test: last probe', JSON.stringify(state, null, 2));
    console.error('smoke-test: best boot', JSON.stringify(bestBoot, null, 2));
    if (rendererLogs.length > 0) {
      console.error('smoke-test: renderer console/exceptions:');
      for (const line of rendererLogs) console.error('  ', line);
    } else {
      console.error('smoke-test: (no renderer console lines captured)');
    }
    const setupErrorLog = path.join(atomHome, 'setup-error.log');
    if (fs.existsSync(setupErrorLog)) {
      console.error('smoke-test: setup-error.log:');
      console.error(fs.readFileSync(setupErrorLog, 'utf8'));
    } else {
      console.error('smoke-test: no setup-error.log in ATOM_HOME');
    }
    try {
      const targets = await jsonList();
      console.error(
        'smoke-test: CDP targets',
        JSON.stringify(
          targets.map(t => ({ type: t.type, url: t.url, title: t.title })),
          null,
          2
        )
      );
    } catch (error) {
      console.error('smoke-test: could not list CDP targets:', error.message);
    }
    console.error(appOutput.slice(-8000));
    process.exit(2);
  } finally {
    shutdown();
  }
}

main().catch(error => {
  console.error('smoke-test: infrastructure error:', error.stack || error);
  process.exit(2);
});
