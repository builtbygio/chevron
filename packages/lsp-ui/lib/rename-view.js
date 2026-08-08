'use strict';

/**
 * Mini-editor modal for rename (Phase 4).
 */

class RenameView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-rename', 'native-key-bindings');

    this.label = document.createElement('div');
    this.label.classList.add('lsp-ui-rename-label');
    this.label.textContent = 'Rename to:';

    this.input = document.createElement('atom-text-editor');
    this.input.setAttribute('mini', true);

    this.element.appendChild(this.label);
    this.element.appendChild(this.input);

    this._panel = null;
    this._resolve = null;
    this._miniEditor = null;
  }

  /**
   * @param {string} placeholder
   * @param {object} env
   * @returns {Promise<string|null>}
   */
  prompt(placeholder, env) {
    this.hide();
    return new Promise(resolve => {
      this._resolve = resolve;
      if (!env || !env.workspace) {
        resolve(null);
        return;
      }

      this._panel = env.workspace.addModalPanel({
        item: this.element,
        visible: true
      });

      // atom-text-editor custom element gets model after attach
      requestAnimationFrame(() => {
        try {
          this._miniEditor =
            this.input.getModel && this.input.getModel();
          if (this._miniEditor) {
            this._miniEditor.setText(placeholder || '');
            this._miniEditor.selectAll();
          } else if (this.input.setText) {
            this.input.setText(placeholder || '');
          }
        } catch (_) {
          /* ignore */
        }
        if (this.input.focus) this.input.focus();
      });

      this._onConfirm = () => {
        let text = '';
        try {
          if (this._miniEditor) text = this._miniEditor.getText();
          else if (this.input.getModel) text = this.input.getModel().getText();
        } catch (_) {
          text = '';
        }
        this.hide();
        resolve(text && text.trim() ? text.trim() : null);
      };
      this._onCancel = () => {
        this.hide();
        resolve(null);
      };

      this._confirmDisposable =
        env.commands &&
        env.commands.add(this.element, {
          'core:confirm': () => this._onConfirm(),
          'core:cancel': () => this._onCancel()
        });
    });
  }

  hide() {
    if (this._confirmDisposable) {
      try {
        this._confirmDisposable.dispose();
      } catch (_) {
        /* ignore */
      }
      this._confirmDisposable = null;
    }
    if (this._panel) {
      try {
        this._panel.destroy();
      } catch (_) {
        /* ignore */
      }
      this._panel = null;
    }
    this._miniEditor = null;
  }

  destroy() {
    this.hide();
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
  }
}

module.exports = { RenameView };
