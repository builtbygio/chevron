'use strict';

/**
 * Stub alternate diagnostics UI (G6 proof).
 * Consumes lsp.diagnostics and shows "ALT N" on the status bar.
 * Does not replace lsp-ui; both can run. Disable lsp-ui to use only this.
 */

const { CompositeDisposable } = require('event-kit');

let disposables = null;
let tile = null;
let el = null;
let lastCount = 0;

function update() {
  if (el) el.textContent = `ALT ${lastCount}`;
}

module.exports = {
  activate() {
    disposables = new CompositeDisposable();
  },

  deactivate() {
    if (tile) {
      tile.destroy();
      tile = null;
    }
    el = null;
    if (disposables) disposables.dispose();
    disposables = null;
  },

  consumeDiagnostics(service) {
    if (!service || !service.onDidUpdateDiagnostics) return;
    if (!disposables) disposables = new CompositeDisposable();
    lastCount = typeof service.getTotalCount === 'function' ? service.getTotalCount() : 0;
    update();
    disposables.add(
      service.onDidUpdateDiagnostics(() => {
        lastCount =
          typeof service.getTotalCount === 'function'
            ? service.getTotalCount()
            : 0;
        update();
      })
    );
  },

  consumeStatusBar(statusBar) {
    el = document.createElement('span');
    el.classList.add('inline-block', 'lsp-diagnostics-stub');
    el.title =
      'lsp-diagnostics-stub: alternate lsp.diagnostics consumer (G6 seam)';
    update();
    tile = statusBar.addRightTile({ item: el, priority: 49 });
  }
};
