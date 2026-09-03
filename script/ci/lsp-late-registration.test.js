'use strict';

/**
 * A server registered after the editors were observed still starts.
 *
 * Packages register from `consumeLsp`, which runs after `activate()` has
 * already walked the open editors and told each one there was no server for
 * its scope. Nothing asked again, so installing a language server and
 * reloading -- what the Install panel tells you to do -- left the editor still
 * reporting "No language server for source.gfm", with the package active and
 * its registration in place.
 *
 * Runs the real client against a stubbed ipcRenderer and workspace.
 *
 * Run: node --test script/ci/lsp-late-registration.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const INDEX = path.join(ROOT, 'src', 'lsp', 'index.js');

const invocations = [];
const ipcStub = {
  invoke: async (channel, payload) => {
    invocations.push({ channel, payload });
    if (channel === 'lsp:is-trusted') return true;
    if (channel === 'lsp:list-servers') return [];
    if (channel === 'lsp:list-trusted') return [];
    return null;
  },
  on() {},
  removeListener() {}
};

const projectRoot = path.join(ROOT, 'spec');
const editor = {
  getPath: () => path.join(projectRoot, 'notes.md'),
  getGrammar: () => ({ scopeName: 'source.gfm' }),
  onDidDestroy: () => ({ dispose() {} }),
  onDidSave: () => ({ dispose() {} }),
  getBuffer: () => ({ onDidChangeText: () => ({ dispose() {} }) })
};

const chevronStub = {
  workspace: {
    observeTextEditors: cb => {
      cb(editor);
      return { dispose() {} };
    },
    getTextEditors: () => [editor],
    getActiveTextEditor: () => editor
  },
  project: { getPaths: () => [projectRoot] },
  commands: { add: () => ({ dispose() {} }) },
  config: { get: () => undefined, onDidChange: () => ({ dispose() {} }) },
  notifications: { addInfo() {}, addWarning() {}, addError() {} },
  getLoadSettings: () => ({ resourcePath: ROOT })
};

let lsp;
let originalLoad;

before(async () => {
  originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === 'electron') return { ipcRenderer: ipcStub };
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[INDEX];
  global.chevron = chevronStub;
  lsp = require(INDEX);
  lsp.activate();
  // Let the editor sweep run: it finds no registration for source.gfm.
  await new Promise(resolve => setTimeout(resolve, 50));
});

after(() => {
  try {
    lsp.deactivate();
  } catch (error) {
    /* the stub environment has nothing to tear down */
  }
  Module._load = originalLoad;
  delete require.cache[INDEX];
  delete global.chevron;
});

const started = () => invocations.filter(i => i.channel === 'lsp:start-server');

describe('a language server registered after activate', () => {
  it('starts nothing before it is registered', () => {
    assert.strictEqual(started().length, 0);
    assert.strictEqual(lsp._internals.lastNotice.kind, 'no-server');
  });

  it('starts for the editors that are already open', async () => {
    const service = lsp.getLspService();
    service.registerServer({
      id: 'test-prose',
      scopes: ['source.gfm'],
      // Absolute, so resolveCommand takes it as-is without a PATH lookup.
      command: process.execPath,
      args: ['--version']
    });
    await new Promise(resolve => setTimeout(resolve, 50));

    const starts = started();
    assert.strictEqual(
      starts.length,
      1,
      'registering a server must re-ask for the open editors; without that ' +
        'an installed language server stays inert until something reopens ' +
        'the file'
    );
    assert.strictEqual(starts[0].payload.projectRoot, projectRoot);
    assert.match(starts[0].payload.serverId, /^test-prose:/);
  });

  it('lets the editor find the server it now has', () => {
    assert.match(lsp.getServerIdForEditor(editor) || '', /^test-prose:/);
  });
});
