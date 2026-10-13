'use strict';

/**
 * `.editorconfig` support: what the editorconfig package reads from the files,
 * and where TextEditorRegistry and whitespace rank it -- below a project
 * root's `.chevron/config.json`, above the user's config.
 * docs/reference/config-precedence.md
 *
 * Run: node --test script/ci/editorconfig.test.js
 */

const { describe, it, before, after } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const { makeTempDir } = require('../lib/temp-dir');

const ROOT = path.resolve(__dirname, '..', '..');
const {
  Resolver,
  editorSettingsFor,
  lineEndingFor
} = require(path.join(ROOT, 'packages', 'editorconfig', 'lib', 'resolver.js'));

let originalLoad;
let TextEditorRegistry;
let Whitespace;

before(() => {
  originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === './text-editor') return class TextEditor {};
    if (request === 'chevron') return require('event-kit');
    return originalLoad.call(this, request, parent, isMain);
  };
  TextEditorRegistry = require(path.join(ROOT, 'src', 'text-editor-registry.js'));
  Whitespace = require(path.join(ROOT, 'packages', 'whitespace', 'lib', 'whitespace.js'));
});

after(() => {
  Module._load = originalLoad;
});

function tree(files) {
  const dir = makeTempDir('editorconfig-');
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

describe('Resolver', () => {
  const dir = tree({
    '.editorconfig': [
      'root = true',
      '[*]',
      'indent_style = space',
      'indent_size = 2',
      'end_of_line = lf',
      'trim_trailing_whitespace = true',
      '[*.go]',
      'indent_style = tab',
      'tab_width = 8',
      '[Makefile]',
      'trim_trailing_whitespace = unset'
    ].join('\n'),
    'sub/.editorconfig': '[*.js]\nindent_size = 4\ncharset = latin1\n'
  });

  it('combines sections from the nearest file up to root = true', () => {
    const { properties, files } = new Resolver().resolve(path.join(dir, 'sub', 'a.js'));
    assert.strictEqual(properties.indent_style, 'space');
    assert.strictEqual(properties.indent_size, 4);
    assert.strictEqual(properties.charset, 'latin1');
    assert.deepStrictEqual(files, [
      path.join(dir, '.editorconfig'),
      path.join(dir, 'sub', '.editorconfig')
    ]);
  });

  it('drops properties set to unset', () => {
    const { properties } = new Resolver().resolve(path.join(dir, 'Makefile'));
    assert.strictEqual('trim_trailing_whitespace' in properties, false);
  });

  it('answers nothing for a file no section matches, or no path', () => {
    const outside = tree({});
    const resolver = new Resolver();
    assert.deepStrictEqual(resolver.resolve(path.join(outside, 'a.txt')).files, []);
    assert.deepStrictEqual(resolver.resolve(null).properties, {});
    assert.deepStrictEqual(resolver.resolve('relative.js').properties, {});
  });

  it('reads the files again only after clear', () => {
    const local = tree({ '.editorconfig': 'root = true\n[*]\nindent_size = 3\n' });
    const resolver = new Resolver();
    const file = path.join(local, 'a.txt');
    assert.strictEqual(resolver.resolve(file).properties.indent_size, 3);
    fs.writeFileSync(path.join(local, '.editorconfig'), 'root = true\n[*]\nindent_size = 5\n');
    assert.strictEqual(resolver.resolve(file).properties.indent_size, 3);
    resolver.clear();
    assert.strictEqual(resolver.resolve(file).properties.indent_size, 5);
  });

  it('survives a parser that throws', () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const resolver = new Resolver({
        parseSync() {
          throw new Error('broken');
        }
      });
      assert.deepStrictEqual(resolver.resolve('/x/a.js').properties, {});
    } finally {
      console.warn = warn;
    }
  });
});

describe('editorSettingsFor', () => {
  it('maps indentation, charset and line length to editor params', () => {
    assert.deepStrictEqual(
      editorSettingsFor({
        indent_style: 'space',
        indent_size: 2,
        tab_width: 8,
        charset: 'utf-16le',
        max_line_length: 100
      }),
      { softTabs: true, tabLength: 2, encoding: 'utf16le', preferredLineLength: 100 }
    );
  });

  it('uses tab_width for tab indentation', () => {
    assert.deepStrictEqual(
      editorSettingsFor({ indent_style: 'tab', indent_size: 4, tab_width: 8 }),
      { softTabs: false, tabLength: 8 }
    );
  });

  it('ignores values the editor cannot take', () => {
    assert.deepStrictEqual(
      editorSettingsFor({
        indent_style: 'mixed',
        indent_size: 'tab',
        charset: 'utf-8-bom',
        max_line_length: 'off'
      }),
      {}
    );
  });

  it('maps end_of_line to a line ending', () => {
    assert.strictEqual(lineEndingFor({ end_of_line: 'crlf' }), '\r\n');
    assert.strictEqual(lineEndingFor({ end_of_line: 'lf' }), '\n');
    assert.strictEqual(lineEndingFor({}), null);
  });
});

function fakeConfig({ user = {}, root = {} } = {}) {
  return {
    get(keyPath, options = {}) {
      if (options.root && keyPath in root) return root[keyPath];
      return keyPath in user ? user[keyPath] : undefined;
    },
    getSourceOf(keyPath, options = {}) {
      if (options.root && keyPath in root) return { source: 'root' };
      return { source: keyPath in user ? 'user' : 'default' };
    },
    onDidChange: () => ({ dispose() {} })
  };
}

function fakeEditor(filePath) {
  return {
    updates: [],
    softTabs: null,
    getPath: () => filePath,
    getRootScopeDescriptor: () => ({ isEqual: () => true }),
    update(params) {
      this.updates.push(params);
    },
    setSoftTabs(value) {
      this.softTabs = value;
    },
    usesSoftTabs: () => undefined
  };
}

describe('TextEditorRegistry settings providers', () => {
  const file = '/repo/a.js';

  it('a provided value beats the user config', () => {
    const registry = new TextEditorRegistry({
      config: fakeConfig({ user: { 'editor.tabLength': 4 } })
    });
    registry.addSettingsProvider({ settingsForPath: () => ({ tabLength: 2 }) });
    assert.strictEqual(registry.textEditorParamsForScope(null, file).tabLength, 2);
  });

  it("the root's config beats a provided value", () => {
    const registry = new TextEditorRegistry({
      config: fakeConfig({
        user: { 'editor.tabLength': 4 },
        root: { 'editor.tabLength': 8 }
      })
    });
    registry.addSettingsProvider({ settingsForPath: () => ({ tabLength: 2 }) });
    assert.strictEqual(registry.textEditorParamsForScope(null, file).tabLength, 8);
  });

  it('asks providers only about files with a path', () => {
    const registry = new TextEditorRegistry({
      config: fakeConfig({ user: { 'editor.tabLength': 4 } })
    });
    registry.addSettingsProvider({ settingsForPath: () => ({ tabLength: 2 }) });
    assert.strictEqual(registry.textEditorParamsForScope(null, undefined).tabLength, 4);
  });

  it('falls back to config when a provider throws', () => {
    const registry = new TextEditorRegistry({
      config: fakeConfig({ user: { 'editor.tabLength': 4 } })
    });
    const error = console.error;
    console.error = () => {};
    try {
      registry.addSettingsProvider({
        settingsForPath() {
          throw new Error('broken');
        }
      });
      assert.strictEqual(registry.textEditorParamsForScope(null, file).tabLength, 4);
    } finally {
      console.error = error;
    }
  });

  it('decides soft tabs unless the root sets the tab type', () => {
    const registry = new TextEditorRegistry({
      config: fakeConfig({ user: { 'editor.tabType': 'soft' } })
    });
    registry.addSettingsProvider({ settingsForPath: () => ({ softTabs: false }) });
    const editor = fakeEditor(file);
    registry.updateSoftTabsForEditor(editor);
    assert.strictEqual(editor.softTabs, false);

    const rooted = new TextEditorRegistry({
      config: fakeConfig({ root: { 'editor.tabType': 'soft' } })
    });
    rooted.addSettingsProvider({ settingsForPath: () => ({ softTabs: false }) });
    rooted.updateSoftTabsForEditor(editor);
    assert.strictEqual(editor.softTabs, true);
  });

  it('re-applies open editors when a provider is added or removed', () => {
    const registry = new TextEditorRegistry({
      config: fakeConfig({ user: { 'editor.tabLength': 4 } })
    });
    const editor = fakeEditor(file);
    registry.editorsWithMaintainedConfig.add(editor);
    registry.paramsByEditor.set(editor, registry.textEditorParamsForScope(null, file));

    const disposable = registry.addSettingsProvider({
      settingsForPath: () => ({ tabLength: 2 })
    });
    assert.deepStrictEqual(editor.updates, [{ tabLength: 2 }]);

    disposable.dispose();
    assert.deepStrictEqual(editor.updates, [{ tabLength: 2 }, { tabLength: 4 }]);
  });
});

describe('whitespace and .editorconfig', () => {
  function withConfig(config, run) {
    const previous = global.chevron;
    global.chevron = { config };
    try {
      run(Object.create(Whitespace.prototype));
    } finally {
      global.chevron = previous;
    }
  }
  const editor = fakeEditor('/repo/a.js');

  it('an .editorconfig value beats the user setting', () => {
    withConfig(fakeConfig({ user: { 'whitespace.removeTrailingWhitespace': true } }), ws => {
      assert.strictEqual(ws.settingFor(editor, 'whitespace.removeTrailingWhitespace', false), false);
    });
  });

  it("the root's config beats an .editorconfig value", () => {
    withConfig(fakeConfig({ root: { 'whitespace.removeTrailingWhitespace': true } }), ws => {
      assert.strictEqual(ws.settingFor(editor, 'whitespace.removeTrailingWhitespace', false), true);
    });
  });

  it('without an .editorconfig value the config decides', () => {
    withConfig(fakeConfig({ user: { 'whitespace.removeTrailingWhitespace': false } }), ws => {
      assert.strictEqual(ws.settingFor(editor, 'whitespace.removeTrailingWhitespace', undefined), false);
    });
  });
});
