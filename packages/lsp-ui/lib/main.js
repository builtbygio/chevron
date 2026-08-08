'use strict';

/**
 * LSP reference UI (Phases 1–4 + goal adjustments):
 * - status-bar, hover, definition, references, signature help
 * - rename, code actions, document symbols
 * - diagnostics gutter + panel via lsp.diagnostics
 * - autocomplete.provider, chevron.lsp, lsp.diagnostics services
 */

const { CompositeDisposable } = require('event-kit');
const { HoverView } = require('./hover-view');
const { DefinitionView } = require('./definition-view');
const { RenameView } = require('./rename-view');
const { ListView } = require('./list-view');
const { DiagnosticsView } = require('./diagnostics-view');
const { pathToUri } = require('../../../src/lsp/path-uri');

let lsp = null;
let disposables = null;
let statusTile = null;
let statusEl = null;
let totalDiagnostics = 0;
let hoverView = null;
let definitionView = null;
let renameView = null;
let listView = null;
let diagnosticsView = null;
let diagnosticsService = null;
let hoverTimer = null;
const HOVER_DELAY_MS = 400;

function ensureLsp() {
  if (lsp) return lsp;
  if (global.__chevronLsp) {
    lsp = global.__chevronLsp;
    return lsp;
  }
  try {
    const getWindowLoadSettings = require('../../../src/get-window-load-settings');
    const { resourcePath } = getWindowLoadSettings();
    const path = require('path');
    lsp = require(path.join(resourcePath, 'src', 'lsp'));
  } catch (_) {
    lsp = require('../../../src/lsp');
  }
  return lsp;
}

function env() {
  return global.chevron || global.atom;
}

function updateStatus() {
  if (!statusEl) return;
  if (totalDiagnostics > 0) {
    statusEl.textContent = `LSP ${totalDiagnostics}`;
    statusEl.classList.add('text-warning');
  } else {
    statusEl.textContent = 'LSP';
    statusEl.classList.remove('text-warning');
  }
}

function scheduleHover(editor) {
  clearHoverTimer();
  if (!editor || !hoverView) return;
  hoverTimer = setTimeout(async () => {
    hoverTimer = null;
    try {
      const client = ensureLsp();
      const result = await client.hoverAtCursor(editor);
      if (!result) {
        hoverView.hide();
        return;
      }
      // Only show if editor still focused
      const e = env();
      if (e && e.workspace && e.workspace.getActiveTextEditor() !== editor) {
        return;
      }
      hoverView.show(editor, editor.getCursorBufferPosition(), result.contents);
    } catch (_) {
      /* ignore */
    }
  }, HOVER_DELAY_MS);
}

function clearHoverTimer() {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function observeEditorForHover(editor) {
  if (!editor || !editor.onDidChangeCursorPosition) return;
  const subs = new CompositeDisposable();
  subs.add(
    editor.onDidChangeCursorPosition(() => {
      if (hoverView) hoverView.hide();
      scheduleHover(editor);
    })
  );
  if (editor.onDidChange) {
    subs.add(
      editor.onDidChange(() => {
        if (hoverView) hoverView.hide();
        clearHoverTimer();
      })
    );
  }
  if (editor.onDidDestroy) {
    subs.add(
      editor.onDidDestroy(() => {
        clearHoverTimer();
        if (hoverView) hoverView.hide();
        subs.dispose();
      })
    );
  }
  return subs;
}

module.exports = {
  activate() {
    disposables = new CompositeDisposable();
    hoverView = new HoverView();
    definitionView = new DefinitionView();
    renameView = new RenameView();
    listView = new ListView();
    diagnosticsView = new DiagnosticsView();

    const client = ensureLsp();
    if (typeof client.activate === 'function') client.activate();
    diagnosticsService =
      typeof client.getDiagnosticsService === 'function'
        ? client.getDiagnosticsService()
        : null;

    const refreshDiagnosticsUi = () => {
      const svc = diagnosticsService;
      totalDiagnostics = svc ? svc.getTotalCount() : 0;
      updateStatus();
      if (svc && diagnosticsView) {
        const all = svc.getAllDiagnostics();
        diagnosticsView.renderList(all, env());
        const e = env();
        if (e && e.workspace) {
          for (const editor of e.workspace.getTextEditors()) {
            const filePath = editor.getPath && editor.getPath();
            if (!filePath) continue;
            const uri = pathToUri(filePath);
            const fileDiags = uri ? svc.getDiagnostics(uri) : [];
            diagnosticsView.updateGutter(editor, fileDiags);
          }
        }
      }
    };

    if (diagnosticsService && diagnosticsService.onDidUpdateDiagnostics) {
      disposables.add(
        diagnosticsService.onDidUpdateDiagnostics(() => {
          refreshDiagnosticsUi();
        })
      );
    } else {
      disposables.add(
        client.onDidPublishDiagnostics(() => {
          let total = 0;
          for (const diags of client._internals.diagnosticsByUri.values()) {
            total += diags.length;
          }
          totalDiagnostics = total;
          updateStatus();
        })
      );
    }

    disposables.add(
      client.onDidChangeTrustNeeded(({ projectRoot }) => {
        const e = env();
        if (e && e.notifications) {
          e.notifications.addWarning(
            'Language servers are disabled until you trust this project.\n' +
              'Servers run with full user privileges and can execute project ' +
              'build tooling (they are not sandboxed).\n' +
              `Project: ${projectRoot}`,
            {
              dismissable: true,
              buttons: [
                {
                  text: 'Trust project',
                  onDidClick: () => {
                    e.commands.dispatch(
                      e.views.getView(e.workspace),
                      'chevron-lsp:trust-project'
                    );
                  }
                }
              ]
            }
          );
        }
      })
    );

    if (typeof client.onDidServerRestarting === 'function') {
      disposables.add(
        client.onDidServerRestarting(({ serverId, attempt, delayMs }) => {
          const e = env();
          if (e && e.notifications) {
            e.notifications.addWarning(
              `Language server restarting (${serverId}), attempt ${attempt} in ${delayMs}ms…`,
              { dismissable: true }
            );
          }
        })
      );
    }

    if (typeof client.onDidServerExit === 'function') {
      disposables.add(
        client.onDidServerExit(msg => {
          if (msg.willRestart) return;
          const e = env();
          if (!e || !e.notifications) return;
          if (msg.storm) {
            e.notifications.addError(
              `Language server stopped after repeated crashes (${msg.serverId}).\n` +
                (msg.error || msg.stderr || ''),
              { dismissable: true }
            );
          } else if (msg.reason === 'idle') {
            e.notifications.addInfo(
              `Language server idle-stopped (${msg.serverId}). Re-open a file to start again.`
            );
          }
        })
      );
    }

    disposables.add(
      client.onDidFailStart(({ message }) => {
        const e = env();
        if (e && e.notifications) {
          e.notifications.addError(`Language server failed to start:\n${message}`, {
            dismissable: true
          });
        }
      })
    );

    disposables.add(
      client.onDidRequestHover(({ editor, hover }) => {
        if (!hover) {
          const e = env();
          if (e && e.notifications) {
            e.notifications.addInfo('No hover information');
          }
          return;
        }
        hoverView.show(editor, editor.getCursorBufferPosition(), hover.contents);
      })
    );

    disposables.add(
      client.onDidRequestDefinition(async ({ locations }) => {
        await definitionView.openLocations(locations, env());
      })
    );

    if (typeof client.onDidRequestReferences === 'function') {
      disposables.add(
        client.onDidRequestReferences(async ({ locations }) => {
          const e = env();
          if (!locations || locations.length === 0) {
            if (e && e.notifications) {
              e.notifications.addInfo('No references found');
            }
            return;
          }
          // Reuse definition list UI for references
          await definitionView.openLocations(locations, e);
        })
      );
    }

    if (typeof client.onDidRequestSignatureHelp === 'function') {
      disposables.add(
        client.onDidRequestSignatureHelp(({ editor, help }) => {
          if (!help) {
            const e = env();
            if (e && e.notifications) {
              e.notifications.addInfo('No signature help');
            }
            return;
          }
          const text =
            typeof client.formatSignatureHelp === 'function'
              ? client.formatSignatureHelp(help)
              : (help.signatures && help.signatures[0] && help.signatures[0].label) ||
                '';
          hoverView.show(editor, editor.getCursorBufferPosition(), {
            kind: 'plaintext',
            value: text
          });
        })
      );
    }

    if (typeof client.onDidRequestRename === 'function') {
      disposables.add(
        client.onDidRequestRename(async ({ editor, prepare }) => {
          const e = env();
          const newName = await renameView.prompt(
            (prepare && prepare.placeholder) || '',
            e
          );
          if (!newName) return;
          const result = await client.renameAtCursor(editor, newName);
          if (!result.ok && e && e.notifications) {
            e.notifications.addError(
              `Rename failed: ${result.error || 'unknown'}`,
              { dismissable: true }
            );
          } else if (result.ok && e && e.notifications) {
            e.notifications.addSuccess(
              `Renamed in ${result.files || 0} file(s) (${result.edits || 0} edits)`
            );
          }
        })
      );
    }

    if (typeof client.onDidRequestCodeActions === 'function') {
      disposables.add(
        client.onDidRequestCodeActions(async ({ editor, actions }) => {
          const e = env();
          if (!actions || actions.length === 0) {
            if (e && e.notifications) {
              e.notifications.addInfo('No code actions available');
            }
            return;
          }
          const picked = await listView.pick(
            'Code actions',
            actions.map(a => ({
              label: a.kind ? `${a.title}  ·  ${a.kind}` : a.title,
              value: a
            })),
            e
          );
          if (!picked) return;
          const result = await client.applyCodeAction(editor, picked);
          if (!result.ok && e && e.notifications) {
            e.notifications.addWarning(
              `Code action failed: ${result.error || 'unknown'}`
            );
          }
        })
      );
    }

    if (typeof client.onDidRequestDocumentSymbols === 'function') {
      disposables.add(
        client.onDidRequestDocumentSymbols(async ({ editor, symbols }) => {
          const e = env();
          if (!symbols || symbols.length === 0) {
            if (e && e.notifications) {
              e.notifications.addInfo('No symbols in document');
            }
            return;
          }
          const picked = await listView.pick(
            'Document symbols',
            symbols.map(s => ({
              label: s.containerName
                ? `${s.kindName} ${s.name}  ·  ${s.containerName}`
                : `${s.kindName} ${s.name}`,
              value: s
            })),
            e
          );
          if (!picked || !editor) return;
          if (editor.setCursorBufferPosition) {
            editor.setCursorBufferPosition(picked.range.start);
            if (editor.scrollToCursorPosition) {
              editor.scrollToCursorPosition({ center: true });
            }
          }
        })
      );
    }

    const e = env();
    if (e && e.workspace) {
      disposables.add(
        e.workspace.observeTextEditors(editor => {
          const sub = observeEditorForHover(editor);
          if (sub) disposables.add(sub);
        })
      );
    }

    // Escape dismisses hover / definition / lists
    if (e && e.commands) {
      disposables.add(
        e.commands.add('atom-workspace', {
          'core:cancel': () => {
            clearHoverTimer();
            if (hoverView) hoverView.hide();
            if (definitionView) definitionView.hide();
            if (renameView) renameView.hide();
            if (listView) listView.hide();
          },
          'chevron-lsp:toggle-diagnostics': () => {
            if (diagnosticsService && diagnosticsView) {
              diagnosticsView.renderList(
                diagnosticsService.getAllDiagnostics(),
                e
              );
              diagnosticsView.togglePanel(e);
            }
          }
        })
      );
    }
  },

  deactivate() {
    clearHoverTimer();
    if (hoverView) {
      hoverView.destroy();
      hoverView = null;
    }
    if (definitionView) {
      definitionView.destroy();
      definitionView = null;
    }
    if (renameView) {
      renameView.destroy();
      renameView = null;
    }
    if (listView) {
      listView.destroy();
      listView = null;
    }
    if (diagnosticsView) {
      diagnosticsView.destroy();
      diagnosticsView = null;
    }
    diagnosticsService = null;
    if (statusTile) {
      statusTile.destroy();
      statusTile = null;
    }
    statusEl = null;
    if (disposables) disposables.dispose();
    disposables = null;
    try {
      ensureLsp().deactivate();
    } catch (_) {
      /* ignore */
    }
  },

  consumeStatusBar(statusBar) {
    statusEl = document.createElement('a');
    statusEl.classList.add('lsp-ui-status', 'inline-block');
    statusEl.href = '#';
    statusEl.textContent = 'LSP';
    statusEl.title =
      'Language servers — click for status; Ctrl-click for diagnostics panel';
    statusEl.addEventListener('click', e => {
      e.preventDefault();
      const ev = env();
      if (!ev || !ev.commands) return;
      if (e.ctrlKey || e.metaKey) {
        ev.commands.dispatch(
          ev.views.getView(ev.workspace),
          'chevron-lsp:toggle-diagnostics'
        );
      } else {
        ev.commands.dispatch(
          ev.views.getView(ev.workspace),
          'chevron-lsp:status'
        );
      }
    });
    statusTile = statusBar.addRightTile({ item: statusEl, priority: 50 });
    updateStatus();
  },

  /**
   * autocomplete.provider v4.0 — provided by package.json
   */
  provideAutocomplete() {
    const client = ensureLsp();
    if (typeof client.activate === 'function') client.activate();
    return client.getAutocompleteProvider();
  },

  /**
   * chevron.lsp 1.0.0 — packages register language servers without core edits.
   */
  provideLsp() {
    const client = ensureLsp();
    if (typeof client.activate === 'function') client.activate();
    return client.getLspService();
  },

  /**
   * lsp.diagnostics 1.0.0 — replaceable diagnostics subscription (G6).
   */
  provideDiagnostics() {
    const client = ensureLsp();
    if (typeof client.activate === 'function') client.activate();
    return client.getDiagnosticsService();
  }
};
