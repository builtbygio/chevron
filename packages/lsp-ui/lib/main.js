'use strict';

/**
 * LSP reference UI (Phase 1): status-bar diagnostic count + trust nudge.
 * Core client: src/lsp
 */

const { CompositeDisposable } = require('event-kit');

let lsp = null;
let disposables = null;
let statusTile = null;
let statusEl = null;
let totalDiagnostics = 0;

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
    // Monorepo / unpackaged: relative from packages/lsp-ui/lib
    lsp = require('../../../src/lsp');
  }
  return lsp;
}

module.exports = {
  activate() {
    disposables = new CompositeDisposable();
    const client = ensureLsp();
    // Core client may already be activated from initialize-application-window
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
        const env = global.chevron || global.atom;
        if (env && env.notifications) {
          env.notifications.addWarning(
            'Language servers are disabled until you trust this project.\n' +
              'Servers can run project build tools (e.g. TypeScript plugins).\n' +
              `Project: ${projectRoot}`,
            {
              dismissable: true,
              buttons: [
                {
                  text: 'Trust project',
                  onDidClick: () => {
                    env.commands.dispatch(
                      env.views.getView(env.workspace),
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
        const env = global.chevron || global.atom;
        if (env && env.notifications) {
          env.notifications.addError(`Language server failed to start:\n${message}`, {
            dismissable: true
          });
        }
      })
    );
  },

  deactivate() {
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
      const env = global.chevron || global.atom;
      if (env && env.commands) {
        env.commands.dispatch(
          env.views.getView(env.workspace),
          'chevron-lsp:status'
        );
      }
    });
    statusTile = statusBar.addRightTile({ item: statusEl, priority: 50 });
    updateStatus();
  }
};

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
