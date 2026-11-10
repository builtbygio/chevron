'use strict';

/**
 * Permission modal for one agent tool call.
 *
 * Same shape as the workspace-trust modal: two buttons, and the safe one
 * holds focus. Enter acts on whichever button is focused, so a stray confirm
 * denies. Allowing is a click, or Enter while Allow is focused.
 *
 * Colors are sampled after attach for the same reason as TrustView: several
 * themes leave the modal panel transparent, and a syntax rule can paint a
 * white field under pale text.
 */

function parseRgb(color) {
  if (!color || color === 'transparent') return null;
  const text = String(color);
  const rgba = text.match(
    /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?/
  );
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (alpha === 0) return null;
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) };
  }
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

class AgentPermissionView {
  constructor() {
    this.element = document.createElement('div');
    this.element.classList.add('lsp-ui-trust', 'native-key-bindings');
    this.element.setAttribute('tabindex', '-1');

    this.titleEl = document.createElement('h1');
    this.titleEl.classList.add('lsp-ui-trust-title');
    this.titleEl.textContent = 'Allow this tool call?';

    this.leadEl = document.createElement('p');
    this.leadEl.classList.add('lsp-ui-trust-lead');

    this.pathWrap = document.createElement('div');
    this.pathWrap.classList.add('lsp-ui-trust-path-wrap');

    this.pathLabel = document.createElement('div');
    this.pathLabel.classList.add('lsp-ui-trust-path-label');

    this.pathEl = document.createElement('div');
    this.pathEl.classList.add('lsp-ui-trust-path');

    this.pathWrap.appendChild(this.pathLabel);
    this.pathWrap.appendChild(this.pathEl);

    this.bodyEl = document.createElement('p');
    this.bodyEl.classList.add('lsp-ui-trust-body');
    this.bodyEl.textContent =
      'Allowing lets the agent do this once. Deny is the safe answer, and Chevron does not remember the choice after this session.';

    this.actions = document.createElement('div');
    this.actions.classList.add('lsp-ui-trust-actions');

    this.denyBtn = document.createElement('button');
    this.denyBtn.classList.add('btn');
    this.denyBtn.type = 'button';
    this.denyBtn.textContent = "Don't allow";

    this.allowBtn = document.createElement('button');
    this.allowBtn.classList.add('btn', 'btn-primary');
    this.allowBtn.type = 'button';
    this.allowBtn.textContent = 'Allow';

    this.actions.appendChild(this.denyBtn);
    this.actions.appendChild(this.allowBtn);

    this.element.appendChild(this.titleEl);
    this.element.appendChild(this.leadEl);
    this.element.appendChild(this.pathWrap);
    this.element.appendChild(this.bodyEl);
    this.element.appendChild(this.actions);

    this._panel = null;
    this._commands = null;
    this._resolve = null;

    this.allowBtn.addEventListener('click', () => this._finish(true));
    this.denyBtn.addEventListener('click', () => this._finish(false));
  }

  applyContrast() {
    const host =
      (this.element.closest && this.element.closest('chevron-panel.modal')) ||
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
   * @param {{ kind: string, summary: string, detail?: string }} request
   * @param {{ workspace?: object, commands?: object }} env
   * @returns {Promise<boolean>}
   */
  prompt(request, env) {
    if (this._resolve) this._finish(false);
    else this.hide();
    return new Promise(resolve => {
      this._resolve = resolve;
      if (!env || !env.workspace) {
        this._finish(false);
        return;
      }
      const kind = request && request.kind ? String(request.kind) : 'tool';
      const summary = request && request.summary ? String(request.summary) : '';
      const detail = request && request.detail ? String(request.detail) : summary;
      this.leadEl.textContent = summary;
      this.pathLabel.textContent = kind;
      this.pathEl.textContent = detail;
      this.pathEl.setAttribute('title', detail);
      this._panel = env.workspace.addModalPanel({
        item: this.element,
        visible: true,
        autoFocus: true
      });
      if (env.commands) {
        this._commands = env.commands.add(this.element, {
          'core:confirm': () => this._finish(this._allowIsFocused()),
          'core:cancel': () => this._finish(false)
        });
      }
      const focusDeny = () => {
        try {
          this.applyContrast();
          this.denyBtn.focus();
        } catch (_) {
          /* ignore */
        }
      };
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(focusDeny);
      } else {
        focusDeny();
      }
    });
  }

  _allowIsFocused() {
    try {
      return document.activeElement === this.allowBtn;
    } catch (_) {
      return false;
    }
  }

  _finish(allowed) {
    const resolve = this._resolve;
    this._resolve = null;
    this.hide();
    if (resolve) resolve(Boolean(allowed));
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
    if (this._resolve) this._finish(false);
    else this.hide();
  }

  isVisible() {
    return Boolean(this._panel);
  }
}

module.exports = { AgentPermissionView };
