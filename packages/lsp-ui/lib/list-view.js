'use strict';

/**
 * Simple modal pick-list for code actions / document symbols.
 */

class ListView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-list', 'native-key-bindings');
    this.element.tabIndex = -1;
    this._panel = null;
    this._resolve = null;
  }

  /**
   * @param {string} title
   * @param {Array<{label: string, value: any}>} items
   * @param {object} env
   * @returns {Promise<any|null>}
   */
  pick(title, items, env) {
    this.hide();
    return new Promise(resolve => {
      this._resolve = resolve;
      if (!env || !env.workspace || !items || items.length === 0) {
        resolve(null);
        return;
      }

      this.element.innerHTML = '';
      const heading = document.createElement('div');
      heading.classList.add('lsp-ui-list-title');
      heading.textContent = title;
      this.element.appendChild(heading);

      const list = document.createElement('ul');
      list.classList.add('lsp-ui-list-items');

      for (const item of items) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = item.label;
        a.addEventListener('click', e => {
          e.preventDefault();
          this.hide();
          resolve(item.value);
        });
        li.appendChild(a);
        list.appendChild(li);
      }

      this.element.appendChild(list);
      this._panel = env.workspace.addModalPanel({
        item: this.element,
        visible: true
      });

      this._cancelDisposable =
        env.commands &&
        env.commands.add(this.element, {
          'core:cancel': () => {
            this.hide();
            resolve(null);
          }
        });
    });
  }

  hide() {
    if (this._cancelDisposable) {
      try {
        this._cancelDisposable.dispose();
      } catch (_) {
        /* ignore */
      }
      this._cancelDisposable = null;
    }
    if (this._panel) {
      try {
        this._panel.destroy();
      } catch (_) {
        /* ignore */
      }
      this._panel = null;
    }
    this.element.innerHTML = '';
  }

  destroy() {
    this.hide();
  }
}

module.exports = { ListView };
