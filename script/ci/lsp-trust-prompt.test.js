'use strict';

/**
 * The workspace-trust modal defaults to the safe answer.
 *
 * Granting trust lets a project's own tooling execute — build scripts, plugins
 * in node_modules, proc macros. The native dialog in src/main-process/lsp-trust.js
 * is `defaultId: 0, cancelId: 0` (Cancel) for that reason. The in-editor modal
 * used to focus "Trust project" and bind core:confirm straight to granting, so
 * any confirm that reached it said yes: the smoke runner's project-find confirm
 * granted trust to a folder nothing had trusted, and a stray Enter would too.
 *
 * Run: node --test script/ci/lsp-trust-prompt.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const TARGET = path.join(ROOT, 'packages/lsp-ui/lib/trust-view.js');

class StubEl {
  constructor(tag) {
    this.tagName = tag;
    this.nodeType = 1;
    this.childNodes = [];
    this.parentElement = null;
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this.classList = { add: () => {}, remove: () => {}, contains: () => false };
  }
  appendChild(child) {
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    this.childNodes = this.childNodes.filter(c => c !== child);
  }
  setAttribute(name, value) {
    this._attrs[name] = value;
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  focus() {
    global.document.activeElement = this;
  }
  querySelector() {
    return null;
  }
}

function withStubDom(fn) {
  const saved = { document: global.document, window: global.window, raf: global.requestAnimationFrame };
  const doc = {
    createElement: tag => new StubEl(tag),
    createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
    body: new StubEl('body'),
    documentElement: new StubEl('html'),
    activeElement: null
  };
  global.document = doc;
  global.window = { getComputedStyle: () => ({ backgroundColor: 'rgb(30, 30, 30)' }) };
  global.requestAnimationFrame = cb => cb();
  try {
    delete require.cache[Module._resolveFilename(TARGET)];
    return fn(require(TARGET));
  } finally {
    delete require.cache[Module._resolveFilename(TARGET)];
    global.document = saved.document;
    global.window = saved.window;
    global.requestAnimationFrame = saved.raf;
  }
}

// Drives prompt() and hands back the view plus the command handlers it bound.
function openPrompt(TrustView) {
  const view = new TrustView();
  let handlers = null;
  const env = {
    workspace: { addModalPanel: () => ({ destroy: () => {} }) },
    commands: {
      add: (_el, map) => {
        handlers = map;
        return { dispose: () => {} };
      }
    }
  };
  const settled = view.prompt('/tmp/some-project', env);
  return { view, handlers, settled };
}

describe('workspace trust prompt', () => {
  it('focuses the safe answer, not "Trust project"', () => {
    withStubDom(({ TrustView }) => {
      const { view } = openPrompt(TrustView);
      assert.strictEqual(
        global.document.activeElement,
        view.declineBtn,
        'the decline button must hold focus when the modal opens'
      );
    });
  });

  it('a confirm with default focus declines', async () => {
    await withStubDom(async ({ TrustView }) => {
      const { handlers, settled } = openPrompt(TrustView);
      handlers['core:confirm']();
      assert.strictEqual(await settled, false);
    });
  });

  it('a confirm grants only when trust is the focused button', async () => {
    await withStubDom(async ({ TrustView }) => {
      const { view, handlers, settled } = openPrompt(TrustView);
      view.trustBtn.focus();
      handlers['core:confirm']();
      assert.strictEqual(await settled, true);
    });
  });

  it('cancel declines', async () => {
    await withStubDom(async ({ TrustView }) => {
      const { handlers, settled } = openPrompt(TrustView);
      handlers['core:cancel']();
      assert.strictEqual(await settled, false);
    });
  });

  it('the native dialog still defaults to Cancel', () => {
    const source = fs.readFileSync(
      path.join(ROOT, 'src/main-process/lsp-trust.js'),
      'utf8'
    );
    assert.match(source, /defaultId:\s*0/, 'native dialog default must be Cancel');
    assert.match(source, /cancelId:\s*0/, 'native dialog cancel must be Cancel');
  });
});
