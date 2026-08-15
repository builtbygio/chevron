'use strict';

/**
 * In-editor workspace-trust modal (Chevron theme, not a native OS dialog).
 */

class TrustView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-trust', 'native-key-bindings');
    this.element.setAttribute('tabindex', '-1');

    this.titleEl = document.createElement('h1');
    this.titleEl.classList.add('lsp-ui-trust-title');
    this.titleEl.textContent = 'Trust this project?';

    this.pathEl = document.createElement('code');
    this.pathEl.classList.add('lsp-ui-trust-path');

    this.bodyEl = document.createElement('p');
    this.bodyEl.classList.add('lsp-ui-trust-body');
    this.bodyEl.textContent =
      'Language servers run this project’s own tooling. They can execute ' +
      'build scripts and plugins from the folder (for example TypeScript ' +
      'plugins in node_modules, or Rust build scripts). Only trust folders ' +
      'whose contents you trust. Chevron will remember this choice.';

    this.actions = document.createElement('div');
    this.actions.classList.add('lsp-ui-trust-actions');

    this.declineBtn = document.createElement('button');
    this.declineBtn.classList.add('btn');
    this.declineBtn.textContent = "Don't trust";

    this.trustBtn = document.createElement('button');
    this.trustBtn.classList.add('btn', 'btn-primary');
    this.trustBtn.textContent = 'Trust project';

    this.actions.appendChild(this.declineBtn);
    this.actions.appendChild(this.trustBtn);

    this.element.appendChild(this.titleEl);
    this.element.appendChild(this.pathEl);
    this.element.appendChild(this.bodyEl);
    this.element.appendChild(this.actions);

    this._panel = null;
    this._commands = null;
    this._resolve = null;

    this.trustBtn.addEventListener('click', () => this._finish(true));
    this.declineBtn.addEventListener('click', () => this._finish(false));
  }

  /**
   * @param {string} projectRoot
   * @param {object} env
   * @returns {Promise<boolean>} true = trust, false = decline (persisted)
   */
  prompt(projectRoot, env) {
    this.hide();
    return new Promise(resolve => {
      this._resolve = resolve;
      if (!env || !env.workspace) {
        resolve(false);
        return;
      }
      this.pathEl.textContent = projectRoot || '';
      this._panel = env.workspace.addModalPanel({
        item: this.element,
        visible: true,
        autoFocus: true
      });
      if (env.commands) {
        this._commands = env.commands.add(this.element, {
          'core:confirm': () => this._finish(true),
          'core:cancel': () => this._finish(false)
        });
      }
      requestAnimationFrame(() => {
        try {
          this.trustBtn.focus();
        } catch (_) {
          /* ignore */
        }
      });
    });
  }

  _finish(trusted) {
    const resolve = this._resolve;
    this._resolve = null;
    this.hide();
    if (resolve) resolve(Boolean(trusted));
  }

  hide() {
    if (this._commands) {
      try {
        this._commands.dispose();
      } catch (_) {
        /* ignore */
      }
      this._commands = null;
    }
    if (this._panel) {
      try {
        this._panel.destroy();
      } catch (_) {
        /* ignore */
      }
      this._panel = null;
    }
  }

  destroy() {
    if (this._resolve) {
      const resolve = this._resolve;
      this._resolve = null;
      resolve(false);
    }
    this.hide();
  }

  isVisible() {
    return Boolean(this._panel);
  }
}

module.exports = { TrustView };
