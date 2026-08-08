'use strict';

/**
 * Go-to-definition results: single hit opens; multi-hit shows a simple list.
 */

const path = require('path');

class DefinitionView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-definitions', 'native-key-bindings');
    this.element.tabIndex = -1;
    this._panel = null;
  }

  /**
   * @param {Array<{uri, path, range}>} locations
   * @param {object} env chevron/atom environment
   */
  async openLocations(locations, env) {
    if (!locations || locations.length === 0) {
      if (env && env.notifications) {
        env.notifications.addInfo('No definition found');
      }
      return;
    }

    if (locations.length === 1) {
      await this._openOne(locations[0], env);
      return;
    }

    this._showList(locations, env);
  }

  async _openOne(loc, env) {
    const filePath = loc.path;
    if (!filePath || !env || !env.workspace) return;
    const editor = await env.workspace.open(filePath, {
      initialLine: loc.range.start.row,
      initialColumn: loc.range.start.column,
      searchAllPanes: true
    });
    if (editor && editor.setCursorBufferPosition) {
      editor.setCursorBufferPosition(loc.range.start);
      if (editor.scrollToCursorPosition) editor.scrollToCursorPosition({ center: true });
    }
  }

  _showList(locations, env) {
    this.hide();
    this.element.innerHTML = '';

    const title = document.createElement('div');
    title.classList.add('lsp-ui-definitions-title');
    title.textContent = `${locations.length} definitions`;
    this.element.appendChild(title);

    const list = document.createElement('ul');
    list.classList.add('lsp-ui-definitions-list');

    for (const loc of locations) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      const label = loc.path
        ? `${path.basename(loc.path)}:${loc.range.start.row + 1}:${loc.range.start.column + 1}`
        : loc.uri;
      a.textContent = label;
      a.title = loc.path || loc.uri;
      a.addEventListener('click', e => {
        e.preventDefault();
        this.hide();
        this._openOne(loc, env);
      });
      li.appendChild(a);
      list.appendChild(li);
    }

    this.element.appendChild(list);

    if (env && env.workspace && env.workspace.addModalPanel) {
      this._panel = env.workspace.addModalPanel({
        item: this.element,
        visible: true
      });
    }
  }

  hide() {
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

module.exports = { DefinitionView };
