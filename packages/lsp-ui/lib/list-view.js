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
  pick(title, items, env, anchor) {
    this.hide();
    return new Promise(resolve => {
      this._resolve = resolve;
      const finish = value => {
        if (this._resolve !== resolve) return;
        this._resolve = null;
        this.hide();
        resolve(value);
      };
      const box = anchor && anchor.box;
      const canModal = env && env.workspace;
      if (!box && !canModal || !items || items.length === 0) {
        finish(null);
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
        // A full-width button. The old inline link ignored clicks on the row
        // padding, and the document's link handler only cancelled href="#".
        const button = document.createElement('button');
        button.type = 'button';
        button.classList.add('lsp-ui-list-choice');
        button.textContent = item.label;
        const choose = event => {
          if (event.button != null && event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          finish(item.value);
        };
        button.addEventListener('mousedown', choose);
        button.addEventListener('click', choose);
        li.appendChild(button);
        list.appendChild(li);
      }

      this.element.appendChild(list);
      if (box) {
        // Next to the gutter dot. An editor overlay lands hundreds of
        // pixels away from the line that was clicked.
        this.element.style.position = 'fixed';
        this.element.style.zIndex = '20';
        this.element.style.top = box.top + 'px';
        this.element.style.left = box.left + 'px';
        document.body.appendChild(this.element);
        const placed = this.element.getBoundingClientRect();
        const margin = 8;
        let top = box.top;
        let left = box.left;
        if (top + placed.height > window.innerHeight - margin) {
          top = Math.max(margin, box.top - placed.height - 8);
        }
        if (left + placed.width > window.innerWidth - margin) {
          left = Math.max(margin, window.innerWidth - placed.width - margin);
        }
        this.element.style.top = top + 'px';
        this.element.style.left = left + 'px';
        this._anchored = true;
      } else {
        this._panel = env.workspace.addModalPanel({
          item: this.element,
          visible: true
        });
      }

      this._cancelDisposable =
        env.commands &&
        env.commands.add(this.element, {
          'core:cancel': () => finish(null)
        });

      // The opening click has already happened. Later clicks outside dismiss.
      // This listener is capture-phase, so it runs before a row's mousedown.
      // A row click is inside the menu and falls through to that handler.
      setTimeout(() => {
        if (this._resolve !== resolve) return;
        this._outside = event => {
          if (this.element.contains(event.target)) return;
          finish(null);
        };
        document.addEventListener('mousedown', this._outside, true);
      }, 0);
      if (typeof this.element.focus === 'function') this.element.focus();
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
    if (this._outside) {
      document.removeEventListener('mousedown', this._outside, true);
      this._outside = null;
    }
    if (this._anchored) {
      this.element.style.position = '';
      this.element.style.zIndex = '';
      this.element.style.top = '';
      this.element.style.left = '';
      if (this.element.parentNode) this.element.parentNode.removeChild(this.element);
      this._anchored = false;
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
