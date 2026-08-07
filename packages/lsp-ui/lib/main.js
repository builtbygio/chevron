'use strict';

/**
 * LSP reference UI (Phase 1–2):
 * - status-bar diagnostic count + trust nudge
 * - hover tooltip (command + idle cursor)
 * - go-to-definition results
 * - autocomplete.provider v4 via core adapter
 */

const { CompositeDisposable } = require('event-kit');
const { HoverView } = require('./hover-view');
const { DefinitionView } = require('./definition-view');

let lsp = null;
let disposables = null;
let statusTile = null;
let statusEl = null;
let totalDiagnostics = 0;
let hoverView = null;
let definitionView = null;
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

    const client = ensureLsp();
    if (typeof client.activate === 'function') client.activate();

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

    disposables.add(
      client.onDidChangeTrustNeeded(({ projectRoot }) => {
        const e = env();
        if (e && e.notifications) {
          e.notifications.addWarning(
            'Language servers are disabled until you trust this project.\n' +
              'Servers can run project build tools (e.g. TypeScript plugins).\n' +
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

    const e = env();
    if (e && e.workspace) {
      disposables.add(
        e.workspace.observeTextEditors(editor => {
          const sub = observeEditorForHover(editor);
          if (sub) disposables.add(sub);
        })
      );
    }

    // Escape dismisses hover / definition panel
    if (e && e.commands) {
      disposables.add(
        e.commands.add('atom-workspace', {
          'core:cancel': () => {
            clearHoverTimer();
            if (hoverView) hoverView.hide();
            if (definitionView) definitionView.hide();
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
    statusEl.title = 'Language servers — click for status';
    statusEl.addEventListener('click', e => {
      e.preventDefault();
      const ev = env();
      if (ev && ev.commands) {
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
  }
};
