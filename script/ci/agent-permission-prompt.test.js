'use strict';

/**
 * The tool-call modal defaults to the safe answer.
 *
 * Allowing lets an agent read, write, or run something. The workspace-trust
 * modal already focuses the declining button and only grants on confirm when
 * that grant button is focused. This one does the same: a stray Enter denies.
 *
 * docs/reference/agent-session.md
 * Run: node --test script/ci/agent-permission-prompt.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const path = require('path');
const Module = require('module');

const TARGET = path.join(
  path.resolve(__dirname, '..', '..'),
  'src/agent-permission-view.js'
);

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
  const saved = {
    document: global.document,
    window: global.window,
    raf: global.requestAnimationFrame
  };
  const doc = {
    createElement: tag => new StubEl(tag),
    createTextNode: text => ({ nodeType: 3, textContent: String(text) }),
    body: new StubEl('body'),
    documentElement: new StubEl('html'),
    activeElement: null
  };
  global.document = doc;
  global.window = {
    getComputedStyle: () => ({ backgroundColor: 'rgb(30, 30, 30)' })
  };
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

function openPrompt(AgentPermissionView) {
  const view = new AgentPermissionView();
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
  const settled = view.prompt(
    { kind: 'run', summary: 'Run the tests', detail: 'npm test' },
    env
  );
  return { view, handlers, settled };
}

describe('agent permission prompt', () => {
  it('focuses the safe answer, not Allow', () => {
    withStubDom(({ AgentPermissionView }) => {
      const { view } = openPrompt(AgentPermissionView);
      assert.strictEqual(global.document.activeElement, view.denyBtn);
    });
  });

  it('a confirm with default focus denies', async () => {
    await withStubDom(async ({ AgentPermissionView }) => {
      const { handlers, settled } = openPrompt(AgentPermissionView);
      handlers['core:confirm']();
      assert.strictEqual(await settled, false);
    });
  });

  it('a confirm allows only when Allow is the focused button', async () => {
    await withStubDom(async ({ AgentPermissionView }) => {
      const { view, handlers, settled } = openPrompt(AgentPermissionView);
      view.allowBtn.focus();
      handlers['core:confirm']();
      assert.strictEqual(await settled, true);
    });
  });

  it('cancel denies', async () => {
    await withStubDom(async ({ AgentPermissionView }) => {
      const { handlers, settled } = openPrompt(AgentPermissionView);
      handlers['core:cancel']();
      assert.strictEqual(await settled, false);
    });
  });

  it('denies when there is no workspace to show the modal', async () => {
    await withStubDom(async ({ AgentPermissionView }) => {
      const view = new AgentPermissionView();
      const allowed = await view.prompt(
        { kind: 'read', summary: 'Read a file', detail: 'a.js' },
        {}
      );
      assert.strictEqual(allowed, false);
      assert.strictEqual(view.isVisible(), false);
    });
  });
});
