'use strict';

/**
 * In-editor workspace-trust modal (Chevron theme, not a native OS dialog).
 * Colors are applied from the modal panel after attach so syntax/code
 * styles and light inset-panel tokens cannot paint a white field.
 */

function parseRgb(color) {
  if (!color || color === 'transparent') return null;
  const text = String(color);

  // Fully transparent computes as `rgba(0, 0, 0, 0)`, not the keyword, so the
  // check above misses it. Parsed as black it reads as a dark background and
  // the dialog paints pale text -- correct on a dark theme, unreadable on a
  // light one, which is why this only showed up in One Light.
  const rgba = text.match(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/
  );
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (alpha === 0) return null;
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) };
  }

  // Relative colour syntax and color-mix() compute to `color(srgb r g b / a)`
  // with 0-1 channels. Converted stylesheets produce these, so a parser that
  // only understands rgb() would silently fall back to its default.
  const srgb = text.match(
    /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/
  );
  if (srgb) {
    const alpha = srgb[4] === undefined ? 1 : Number(srgb[4]);
    if (alpha === 0) return null;
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255
    };
  }

  return null;
}

// The modal panel itself is transparent in several themes, so sampling it says
// nothing about what the dialog is drawn on. Walk up until something actually
// paints, and fall back to the body.
function effectiveBackground(start) {
  let node = start;
  while (node && node.nodeType === 1) {
    const parsed = parseRgb(window.getComputedStyle(node).backgroundColor);
    if (parsed) return parsed;
    node = node.parentElement;
  }
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const parsed = parseRgb(window.getComputedStyle(el).backgroundColor);
    if (parsed) return parsed;
  }
  return null;
}

function luminance({ r, g, b }) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function rgba({ r, g, b }, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

class TrustView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-trust', 'native-key-bindings');
    this.element.setAttribute('tabindex', '-1');

    this.titleEl = document.createElement('h1');
    this.titleEl.classList.add('lsp-ui-trust-title');
    this.titleEl.textContent = 'Trust this project?';

    this.leadEl = document.createElement('p');
    this.leadEl.classList.add('lsp-ui-trust-lead');
    this.leadEl.textContent =
      'Language servers can run this folder’s own tools — TypeScript plugins, Rust build scripts, and similar.';

    this.pathWrap = document.createElement('div');
    this.pathWrap.classList.add('lsp-ui-trust-path-wrap');

    this.pathLabel = document.createElement('div');
    this.pathLabel.classList.add('lsp-ui-trust-path-label');
    this.pathLabel.textContent = 'Project folder';

    this.pathEl = document.createElement('div');
    this.pathEl.classList.add('lsp-ui-trust-path');

    this.pathWrap.appendChild(this.pathLabel);
    this.pathWrap.appendChild(this.pathEl);

    this.bodyEl = document.createElement('p');
    this.bodyEl.classList.add('lsp-ui-trust-body');
    this.bodyEl.textContent =
      'Only trust folders whose contents you trust. Chevron remembers this choice for this folder.';

    this.actions = document.createElement('div');
    this.actions.classList.add('lsp-ui-trust-actions');

    this.declineBtn = document.createElement('button');
    this.declineBtn.classList.add('btn');
    this.declineBtn.type = 'button';
    this.declineBtn.textContent = "Don't trust";

    this.trustBtn = document.createElement('button');
    this.trustBtn.classList.add('btn', 'btn-primary');
    this.trustBtn.type = 'button';
    this.trustBtn.textContent = 'Trust project';

    this.actions.appendChild(this.declineBtn);
    this.actions.appendChild(this.trustBtn);

    this.element.appendChild(this.titleEl);
    this.element.appendChild(this.leadEl);
    this.element.appendChild(this.pathWrap);
    this.element.appendChild(this.bodyEl);
    this.element.appendChild(this.actions);

    this._panel = null;
    this._commands = null;
    this._resolve = null;

    this.trustBtn.addEventListener('click', () => this._finish(true));
    this.declineBtn.addEventListener('click', () => this._finish(false));
  }

  applyContrast() {
    const host =
      (this.element.closest && this.element.closest('atom-panel.modal')) ||
      this.element;
    const bg = effectiveBackground(host) || { r: 32, g: 33, b: 35 };
    const dark = luminance(bg) < 140;
    const ink = dark ? { r: 236, g: 236, b: 236 } : { r: 28, g: 28, b: 28 };
    const muted = dark ? { r: 176, g: 180, b: 186 } : { r: 90, g: 94, b: 100 };
    const lift = dark
      ? rgba({ r: 255, g: 255, b: 255 }, 0.08)
      : rgba({ r: 0, g: 0, b: 0 }, 0.06);
    const edge = dark
      ? rgba({ r: 255, g: 255, b: 255 }, 0.14)
      : rgba({ r: 0, g: 0, b: 0 }, 0.12);

    this.element.style.color = rgba(ink, 1);
    this.titleEl.style.color = rgba(ink, 1);
    this.leadEl.style.color = rgba(ink, 0.92);
    this.bodyEl.style.color = rgba(ink, 0.88);
    this.pathLabel.style.color = rgba(muted, 1);
    this.pathEl.style.color = rgba(ink, 1);
    this.pathWrap.style.background = lift;
    this.pathWrap.style.borderColor = edge;
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
      this.pathEl.setAttribute('title', projectRoot || '');
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
          this.applyContrast();
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
