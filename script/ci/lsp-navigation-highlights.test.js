'use strict';

/**
 * Go to implementation, go to type definition, and highlighting the uses of
 * the symbol under the cursor (#426).
 *
 * - the providers: what they ask the server, and what they make of the answer,
 *   utf-8 positions included;
 * - the client: the two commands exist on an editor only while its server
 *   advertises them, so nothing offers a command that can only do nothing;
 * - lsp-ui's highlighter: follows the cursor after a pause without clearing in
 *   between (no flicker), clears on the first keystroke, and asks again only
 *   once typing stops.
 *
 * Run: node --test script/ci/lsp-navigation-highlights.test.js
 */

const { describe, it, before, after, mock } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..');
const typescript = require(path.join(ROOT, 'src', 'typescript'));

// The providers are TypeScript; the app compiles them through compile-cache.
require.extensions['.ts'] = (module, filename) => {
  module._compile(
    typescript.compile(fs.readFileSync(filename, 'utf8'), filename),
    filename
  );
};

const { locationsAt, servesCapability, NAVIGATION } = require(path.join(
  ROOT, 'src', 'lsp', 'providers', 'navigation.ts'
));
const {
  normalizeDocumentHighlights,
  documentHighlightsFor
} = require(path.join(ROOT, 'src', 'lsp', 'providers', 'document-highlights.ts'));

function clientWith(answer, { encoding = 'utf-16' } = {}) {
  const requests = [];
  return {
    requests,
    getServerIdForEditor: () => 'server-1',
    getPositionEncoding: () => encoding,
    request: async (serverId, method, params) => {
      requests.push({ serverId, method, params });
      return typeof answer === 'function' ? answer(method, params) : answer;
    }
  };
}

function editorAt(lines, cursor, filePath = '/tmp/project/a.ts') {
  return {
    getPath: () => filePath,
    getCursorBufferPosition: () => cursor,
    lineTextForBufferRow: row => lines[row]
  };
}

describe('navigation provider', () => {
  for (const [kind, method] of [
    ['implementation', 'textDocument/implementation'],
    ['typeDefinition', 'textDocument/typeDefinition']
  ]) {
    it(`${kind} asks ${method} at the cursor and opens LocationLinks`, async () => {
      const client = clientWith({
        result: [
          {
            targetUri: 'file:///tmp/project/impl.ts',
            targetRange: { start: { line: 9, character: 0 }, end: { line: 20, character: 1 } },
            targetSelectionRange: { start: { line: 10, character: 2 }, end: { line: 10, character: 8 } }
          }
        ]
      });
      const locations = await locationsAt(
        client, kind, editorAt(['x.run()'], { row: 0, column: 2 })
      );

      assert.strictEqual(client.requests[0].method, method);
      assert.deepStrictEqual(client.requests[0].params, {
        textDocument: { uri: 'file:///tmp/project/a.ts' },
        position: { line: 0, character: 2 }
      });
      assert.strictEqual(locations.length, 1);
      assert.strictEqual(locations[0].path, '/tmp/project/impl.ts');
      assert.deepStrictEqual(locations[0].range.start, { row: 10, column: 2 });
    });
  }

  it('sends a utf-8 position in bytes to a utf-8 server', async () => {
    const client = clientWith({ result: null }, { encoding: 'utf-8' });
    // "é" is one UTF-16 unit and two UTF-8 bytes.
    await locationsAt(
      client, 'implementation', editorAt(['é = run()'], { row: 0, column: 4 })
    );
    assert.deepStrictEqual(client.requests[0].params.position, { line: 0, character: 5 });
  });

  it('answers [] for an error, and refuses an unknown request', async () => {
    const client = clientWith({ error: { code: -32601 } });
    assert.deepStrictEqual(
      await locationsAt(client, 'typeDefinition', editorAt(['x'], { row: 0, column: 0 })),
      []
    );
    await assert.rejects(
      locationsAt(client, 'declaration', editorAt(['x'], { row: 0, column: 0 })),
      /Unknown navigation request/
    );
  });

  it('reads a provider capability as true, options, or absent', () => {
    const session = capabilities => ({ capabilities });
    assert.strictEqual(servesCapability(session({ implementationProvider: true }), 'implementationProvider'), true);
    assert.strictEqual(servesCapability(session({ implementationProvider: { workDoneProgress: true } }), 'implementationProvider'), true);
    assert.strictEqual(servesCapability(session({ implementationProvider: false }), 'implementationProvider'), false);
    assert.strictEqual(servesCapability(session({}), 'implementationProvider'), false);
    assert.strictEqual(servesCapability({}, 'implementationProvider'), false);
    assert.deepStrictEqual(Object.keys(NAVIGATION), ['implementation', 'typeDefinition']);
  });
});

describe('document highlight provider', () => {
  it('keeps the kind, defaulting to text', () => {
    const range = (line, from, to) => ({
      start: { line, character: from },
      end: { line, character: to }
    });
    const highlights = normalizeDocumentHighlights(
      [
        { range: range(0, 4, 7), kind: 3 },
        { range: range(1, 0, 3), kind: 2 },
        { range: range(2, 0, 3) },
        { kind: 2 }
      ],
      () => 'abc def'
    );
    assert.deepStrictEqual(highlights.map(h => h.kind), ['write', 'read', 'text']);
    assert.deepStrictEqual(highlights[0].range, {
      start: { row: 0, column: 4 },
      end: { row: 0, column: 7 }
    });
  });

  it('converts utf-8 offsets against the editor line', () => {
    // "naïve" — the ï is two bytes: "count" starts at byte 9, column 8.
    const line = 'naïve = count + count';
    const [first] = normalizeDocumentHighlights(
      [{ range: { start: { line: 0, character: 9 }, end: { line: 0, character: 14 } }, kind: 2 }],
      () => line,
      'utf-8'
    );
    assert.strictEqual(line.slice(first.range.start.column, first.range.end.column), 'count');
  });

  it('asks textDocument/documentHighlight, and answers [] when the server fails', async () => {
    const client = clientWith({ result: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, kind: 1 }] });
    const highlights = await documentHighlightsFor(client, editorAt(['x = x'], { row: 0, column: 0 }));
    assert.strictEqual(client.requests[0].method, 'textDocument/documentHighlight');
    assert.strictEqual(highlights.length, 1);

    const failing = clientWith(() => {
      throw new Error('server gone');
    });
    assert.deepStrictEqual(
      await documentHighlightsFor(failing, editorAt(['x'], { row: 0, column: 0 })),
      []
    );
  });
});

describe('client capabilities', () => {
  it('tells servers the client handles all three', () => {
    const host = fs.readFileSync(
      path.join(ROOT, 'src', 'main-process', 'workers', 'lsp-host.js'),
      'utf8'
    );
    assert.match(host, /implementation: \{ linkSupport: true \}/);
    assert.match(host, /typeDefinition: \{ linkSupport: true \}/);
    assert.match(host, /documentHighlight: \{ dynamicRegistration: false \}/);
  });
});

describe('the navigation commands, in the real client', () => {
  const INDEX = path.join(ROOT, 'src', 'lsp', 'index.js');
  const projectRoot = path.join(ROOT, 'spec');
  let lsp;
  let originalLoad;
  let lspEvent = null;
  const registered = [];
  const element = { tagName: 'CHEVRON-TEXT-EDITOR' };
  const editor = {
    getPath: () => path.join(projectRoot, 'thing.navtest'),
    getGrammar: () => ({ scopeName: 'source.navtest' }),
    getCursorBufferPosition: () => ({ row: 0, column: 0 }),
    lineTextForBufferRow: () => 'x',
    getText: () => 'x',
    isDestroyed: () => false,
    onDidDestroy: () => ({ dispose() {} }),
    onDidChangeGrammar: () => ({ dispose() {} }),
    getBuffer: () => ({})
  };
  const ipcStub = {
    invoke: async channel => {
      if (channel === 'lsp:is-trusted') return true;
      if (channel === 'lsp:request') {
        return { result: { uri: 'file:///tmp/impl.navtest', range: { start: { line: 3, character: 1 }, end: { line: 3, character: 4 } } } };
      }
      return null;
    },
    on: (channel, handler) => {
      if (channel === 'lsp:event') lspEvent = handler;
    },
    removeListener() {}
  };
  const live = () => registered.filter(r => !r.disposed).map(r => r.name).sort();
  const initialized = capabilities =>
    lspEvent(null, {
      type: 'server-initialized',
      serverId: lsp.getServerIdForEditor(editor),
      positionEncoding: 'utf-16',
      capabilities
    });

  before(async () => {
    originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'electron') return { ipcRenderer: ipcStub };
      return originalLoad.call(this, request, parent, isMain);
    };
    delete require.cache[INDEX];
    global.chevron = {
      workspace: {
        observeTextEditors: cb => {
          cb(editor);
          return { dispose() {} };
        },
        getTextEditors: () => [editor],
        getActiveTextEditor: () => editor
      },
      views: { getView: () => element },
      project: { getPaths: () => [projectRoot], getDirectories: () => [] },
      commands: {
        add: (target, name, callback) => {
          if (typeof name !== 'string') return { dispose() {} };
          const entry = { target, name, callback, disposed: false };
          registered.push(entry);
          return { dispose: () => { entry.disposed = true; } };
        }
      },
      config: { get: () => undefined, onDidChange: () => ({ dispose() {} }) },
      notifications: { addInfo() {}, addWarning() {}, addError() {} },
      getLoadSettings: () => ({ resourcePath: ROOT })
    };
    lsp = require(INDEX);
    lsp.activate();
    lsp.getLspService().registerServer({
      id: 'navtest',
      scopes: ['source.navtest'],
      command: process.execPath
    });
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  after(() => {
    try {
      lsp.deactivate();
    } catch (error) {
      /* nothing real to tear down */
    }
    Module._load = originalLoad;
    delete require.cache[INDEX];
    delete global.chevron;
  });

  it('registers neither before the server says what it answers', () => {
    assert.ok(lsp.getServerIdForEditor(editor), 'the stub server should be running');
    assert.deepStrictEqual(live(), []);
  });

  it('registers only what the server advertises, on the editor', () => {
    initialized({ implementationProvider: true });
    assert.deepStrictEqual(live(), ['chevron-lsp:go-to-implementation']);
    assert.strictEqual(registered[0].target, element);
    assert.strictEqual(lsp.servesImplementation(editor), true);
    assert.strictEqual(lsp.servesTypeDefinition(editor), false);
  });

  it('opens what the server answered', async () => {
    const opened = new Promise(resolve => lsp.onDidRequestImplementation(resolve));
    await registered.find(r => !r.disposed).callback();
    const { locations } = await opened;
    assert.strictEqual(locations[0].path, '/tmp/impl.navtest');
    assert.deepStrictEqual(locations[0].range.start, { row: 3, column: 1 });
  });

  it('follows the capabilities when a restarted server answers differently', () => {
    initialized({ typeDefinitionProvider: {} });
    assert.deepStrictEqual(live(), ['chevron-lsp:go-to-type-definition']);
  });

  it('removes them when the server exits for good', () => {
    lspEvent(null, {
      type: 'server-exit',
      serverId: lsp.getServerIdForEditor(editor),
      willRestart: false
    });
    assert.deepStrictEqual(live(), []);
  });
});

describe('lsp-ui highlighter', () => {
  const HIGHLIGHTS = path.join(ROOT, 'packages', 'lsp-ui', 'lib', 'document-highlights.js');
  let EditorHighlights;
  let originalLoad;

  before(() => {
    originalLoad = Module._load;
    Module._load = function(request, parent, isMain) {
      if (request === 'chevron') return require('event-kit');
      return originalLoad.call(this, request, parent, isMain);
    };
    ({ EditorHighlights } = require(HIGHLIGHTS));
  });

  after(() => {
    Module._load = originalLoad;
    delete global.chevron;
  });

  function setup({ enabled = true, selectionEmpty = true } = {}) {
    global.chevron = { config: { get: key => (key === 'lsp.documentHighlights' ? enabled : undefined) } };
    const handlers = {};
    const on = name => cb => {
      handlers[name] = cb;
      return { dispose() {} };
    };
    const layers = [];
    const editor = {
      addMarkerLayer: () => {
        const layer = { markers: [], markBufferRange(range) { this.markers.push(range); }, clear() { this.markers = []; }, destroy() {} };
        layers.push(layer);
        return layer;
      },
      // A LayerDecoration: destroy(), and no dispose().
      decorateMarkerLayer: () => ({ destroy() {} }),
      onDidChangeCursorPosition: on('cursor'),
      onDidStopChanging: on('stop'),
      onDidDestroy: on('destroy'),
      getBuffer: () => ({ onDidChange: on('change') }),
      getLastSelection: () => ({ isEmpty: () => selectionEmpty })
    };
    let answers = [];
    const lsp = {
      calls: 0,
      servesDocumentHighlights: () => true,
      documentHighlightsAt: async () => {
        lsp.calls++;
        return answers.shift() || [];
      }
    };
    const highlights = new EditorHighlights(editor, lsp);
    const count = () => layers.reduce((n, layer) => n + layer.markers.length, 0);
    const byKind = () => layers.map(layer => layer.markers.length);
    return { handlers, lsp, highlights, count, byKind, answer: list => answers.push(list) };
  }

  const use = (row, kind) => ({ range: { start: { row, column: 0 }, end: { row, column: 3 } }, kind });
  const settle = () => new Promise(resolve => setImmediate(resolve));

  it('follows the cursor after a pause, one layer per kind', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { handlers, lsp, count, byKind, answer } = setup();
    answer([use(0, 'write'), use(1, 'read'), use(2, 'read'), use(3, 'text')]);

    handlers.cursor();
    handlers.cursor();
    assert.strictEqual(lsp.calls, 0, 'no request before the pause');
    t.mock.timers.tick(250);
    await settle();
    assert.strictEqual(lsp.calls, 1, 'one request for two moves');
    assert.strictEqual(count(), 4);
    assert.deepStrictEqual(byKind(), [1, 2, 1]); // text, read, write
  });

  it('keeps the highlights while the cursor moves, until the new answer replaces them', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { handlers, count, answer } = setup();
    answer([use(0, 'read'), use(1, 'read')]);
    handlers.cursor();
    t.mock.timers.tick(250);
    await settle();
    assert.strictEqual(count(), 2);

    answer([use(5, 'text')]);
    handlers.cursor();
    assert.strictEqual(count(), 2, 'moving must not clear: that is the flicker');
    t.mock.timers.tick(250);
    await settle();
    assert.strictEqual(count(), 1);
  });

  it('clears on the first keystroke and asks again only once typing stops', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { handlers, lsp, count, answer } = setup();
    answer([use(0, 'read')]);
    handlers.cursor();
    t.mock.timers.tick(250);
    await settle();
    assert.strictEqual(count(), 1);

    handlers.change();
    assert.strictEqual(count(), 0, 'every range is stale after an edit');
    handlers.cursor();
    t.mock.timers.tick(1000);
    await settle();
    assert.strictEqual(lsp.calls, 1, 'no requests while typing');

    answer([use(0, 'read')]);
    handlers.stop();
    t.mock.timers.tick(250);
    await settle();
    assert.strictEqual(lsp.calls, 2);
    assert.strictEqual(count(), 1);
  });

  it('drops an answer that arrives after an edit', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { handlers, lsp, count, highlights } = setup();
    let release;
    lsp.documentHighlightsAt = () => new Promise(resolve => { release = resolve; });
    handlers.cursor();
    t.mock.timers.tick(250);
    handlers.change();
    release([use(0, 'read')]);
    await settle();
    assert.strictEqual(count(), 0);
    highlights.destroy();
  });

  it('draws nothing when the setting is off, or over a selection', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const options of [{ enabled: false }, { selectionEmpty: false }]) {
      const { handlers, lsp, count, answer } = setup(options);
      answer([use(0, 'read')]);
      handlers.cursor();
      t.mock.timers.tick(250);
      await settle();
      assert.strictEqual(lsp.calls, 0);
      assert.strictEqual(count(), 0);
    }
  });
});

describe('lsp-ui wiring', () => {
  const read = file => fs.readFileSync(path.join(ROOT, 'packages', 'lsp-ui', file), 'utf8');

  it('binds both commands to keys', () => {
    const keymap = JSON.parse(read('keymaps/lsp-ui.json'))['chevron-workspace chevron-text-editor:not([mini])'];
    assert.strictEqual(keymap['ctrl-f12'], 'chevron-lsp:go-to-implementation');
    assert.strictEqual(keymap['ctrl-shift-f12'], 'chevron-lsp:go-to-type-definition');
  });

  it('shows them in the context menu only where the server answers them', () => {
    const main = read('lib/main.js');
    assert.match(main, /command: 'chevron-lsp:go-to-implementation',\s*shouldDisplay:/);
    assert.match(main, /command: 'chevron-lsp:go-to-type-definition',\s*shouldDisplay:/);
    assert.doesNotMatch(read('menus/lsp-ui.json'), /go-to-implementation|go-to-type-definition/);
  });

  it('has a setting that turns highlighting off', () => {
    const schema = require(path.join(ROOT, 'src', 'config-schema'));
    assert.strictEqual(schema.lsp.properties.documentHighlights.default, true);
  });
});
