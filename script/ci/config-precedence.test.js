'use strict';

/**
 * The config precedence table, as a matrix.
 *
 * docs/reference/config-precedence.md is the prose; this is the contract. When
 * they disagree the test is right and the document is stale.
 *
 * The rule people find surprising, and the reason this is a matrix rather than
 * a handful of cases: **the source outranks the specificity**. A plain setting
 * in a repository's config beats a language-scoped setting in the user's,
 * because the first was written by someone who knew which repository they were
 * in and the second is a default somebody set once.
 *
 * Run: node --test script/ci/config-precedence.test.js
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const Config = require(path.join(ROOT, 'src', 'config'));

const ROOT_A = path.join(path.sep, 'repo', 'a');
const ROOT_B = path.join(path.sep, 'repo', 'a', 'nested');
const OUTSIDE = path.join(path.sep, 'tmp', 'loose.js');
const JS_SCOPE = ['source.js'];

function makeConfig() {
  const config = new Config({ saveCallback() {} });
  config.settingsLoaded = true;
  config.setSchema('editor', {
    type: 'object',
    properties: { tabLength: { type: 'integer', default: 8 } }
  });
  return config;
}

describe('precedence, one root', () => {
  let config;

  beforeEach(() => {
    config = makeConfig();
  });

  it('falls back to the schema default when nobody has an opinion', () => {
    assert.strictEqual(config.get('editor.tabLength'), 8);
    assert.strictEqual(config.getSourceOf('editor.tabLength').source, 'default');
  });

  it('user plain beats the default', () => {
    config.set('editor.tabLength', 4);
    assert.strictEqual(config.get('editor.tabLength'), 4);
    assert.strictEqual(config.getSourceOf('editor.tabLength').source, 'user');
  });

  it('user scoped beats user plain', () => {
    config.set('editor.tabLength', 4);
    config.set('editor.tabLength', 3, { scopeSelector: '.source.js' });
    assert.strictEqual(config.get('editor.tabLength', { scope: JS_SCOPE }), 3);
  });

  it('root plain beats user plain', () => {
    config.set('editor.tabLength', 4);
    config.setRootSettings(ROOT_A, { editor: { tabLength: 2 } });
    assert.strictEqual(config.get('editor.tabLength', { root: ROOT_A }), 2);
    const source = config.getSourceOf('editor.tabLength', { root: ROOT_A });
    assert.strictEqual(source.source, 'root');
    assert.strictEqual(source.scoped, false);
  });

  it('root plain beats user scoped — the source outranks the specificity', () => {
    config.set('editor.tabLength', 3, { scopeSelector: '.source.js' });
    config.setRootSettings(ROOT_A, { editor: { tabLength: 2 } });
    assert.strictEqual(
      config.get('editor.tabLength', { root: ROOT_A, scope: JS_SCOPE }),
      2
    );
  });

  it('root scoped beats root plain', () => {
    config.setRootSettings(ROOT_A, {
      editor: { tabLength: 2 },
      '.source.js': { editor: { tabLength: 6 } }
    });
    assert.strictEqual(
      config.get('editor.tabLength', { root: ROOT_A, scope: JS_SCOPE }),
      6
    );
    const source = config.getSourceOf('editor.tabLength', {
      root: ROOT_A,
      scope: JS_SCOPE
    });
    assert.strictEqual(source.source, 'root');
    assert.strictEqual(source.scoped, true);
  });

  it('does not let a root scoped setting escape its root', () => {
    config.set('editor.tabLength', 4);
    config.setRootSettings(ROOT_A, {
      '.source.js': { editor: { tabLength: 6 } }
    });
    assert.strictEqual(
      config.get('editor.tabLength', { scope: JS_SCOPE }),
      4,
      'a scoped lookup with no root must not see a root config'
    );
    assert.strictEqual(
      config.get('editor.tabLength', { root: OUTSIDE, scope: JS_SCOPE }),
      4,
      'and neither must a file under some other root'
    );
    assert.strictEqual(
      config.getSourceOf('editor.tabLength', { scope: JS_SCOPE }).source,
      'user'
    );
  });

  it('leaves a file outside every root on the user settings', () => {
    config.set('editor.tabLength', 4);
    config.setRootSettings(ROOT_A, { editor: { tabLength: 2 } });
    assert.strictEqual(config.get('editor.tabLength', { root: OUTSIDE }), 4);
    assert.strictEqual(config.get('editor.tabLength'), 4, 'and with no root');
  });
});

describe('precedence, several roots', () => {
  let config;

  beforeEach(() => {
    config = makeConfig();
    config.set('editor.tabLength', 4);
    config.setRootSettings(ROOT_A, { editor: { tabLength: 2 } });
    config.setRootSettings(
      path.join(path.sep, 'repo', 'other'),
      { editor: { tabLength: 7 } }
    );
  });

  it('applies each root to its own files', () => {
    assert.strictEqual(
      config.get('editor.tabLength', { root: path.join(ROOT_A, 'lib', 'x.js') }),
      2
    );
    assert.strictEqual(
      config.get('editor.tabLength', {
        root: path.join(path.sep, 'repo', 'other', 'y.js')
      }),
      7
    );
  });

  it('gives the nearest root a nested file, without stacking', () => {
    config.setRootSettings(ROOT_B, { editor: { tabLength: 5 } });
    assert.strictEqual(
      config.get('editor.tabLength', { root: path.join(ROOT_B, 'deep', 'z.js') }),
      5,
      'longest matching root wins'
    );
    assert.strictEqual(
      config.get('editor.tabLength', { root: path.join(ROOT_A, 'shallow.js') }),
      2,
      'and the outer root still applies outside it'
    );
  });

  it('does not let one root leak into a sibling', () => {
    assert.strictEqual(
      config.get('editor.tabLength', {
        root: path.join(path.sep, 'repo', 'a-sibling', 'file.js')
      }),
      4,
      'a path that merely shares a prefix is not inside the root'
    );
  });

  it('forgets a root when it leaves the project', () => {
    config.setRootSettings(ROOT_A, null);
    assert.strictEqual(config.get('editor.tabLength', { root: ROOT_A }), 4);
    assert.deepStrictEqual(
      config.getConfiguredRoots(),
      [path.join(path.sep, 'repo', 'other')]
    );
  });

  it('replaces a root cleanly rather than merging with what was there', () => {
    config.setRootSettings(ROOT_A, { editor: { tabLength: 9 } });
    assert.strictEqual(config.get('editor.tabLength', { root: ROOT_A }), 9);
    config.setRootSettings(ROOT_A, {});
    assert.strictEqual(
      config.get('editor.tabLength', { root: ROOT_A }),
      4,
      'an emptied root config falls back to user, not to its old value'
    );
  });
});

describe('changes are announced', () => {
  it('fires did-change-root-settings, which onDidChange cannot stand in for', () => {
    const config = makeConfig();
    config.set('editor.tabLength', 4);

    let rootEvents = 0;
    let keyEvents = 0;
    config.onDidChangeRootSettings(() => rootEvents++);
    config.onDidChange('editor.tabLength', () => keyEvents++);

    config.setRootSettings(ROOT_A, { editor: { tabLength: 2 } });
    assert.strictEqual(rootEvents, 1, 'a root gaining config is a change');
    assert.strictEqual(
      keyEvents,
      0,
      'the root-less value did not move, so onDidChange stays silent — this ' +
        'is why the dedicated event exists'
    );

    config.setRootSettings(ROOT_A, null);
    assert.strictEqual(rootEvents, 2, 'and so is a root losing it');
  });
});

describe('trust', () => {
  // Rows: what an untrusted root's config can set, and what waits for trust.
  // The point is that cloning a repository and opening it cannot change how
  // Chevron runs things; how text looks and is written is fair game.
  let config;
  const FILE = path.join(ROOT_A, 'src', 'index.js');

  beforeEach(() => {
    config = makeConfig();
    config.setSchema('lsp', {
      type: 'object',
      properties: {
        formatOnSave: { type: 'boolean', default: false },
        servers: { type: 'object', default: {} }
      }
    });
    config.setSchema('core', {
      type: 'object',
      properties: {
        fileEncoding: { type: 'string', default: 'utf8' },
        disabledPackages: { type: 'array', default: [] }
      }
    });
    config.setSchema('whitespace', {
      type: 'object',
      properties: { removeTrailingWhitespace: { type: 'boolean', default: true } }
    });
  });

  const rows = [
    // [key, root value, applies untrusted?]
    ['editor.tabLength', 2, true],
    ['whitespace.removeTrailingWhitespace', false, true],
    ['core.fileEncoding', 'latin1', true],
    ['lsp.formatOnSave', true, false],
    ['lsp.servers', { evil: { command: 'curl' } }, false],
    ['core.disabledPackages', ['tree-view'], false]
  ];

  for (const [keyPath, value, untrusted] of rows) {
    it(`${keyPath} from an untrusted root: ${untrusted ? 'applies' : 'waits'}`, () => {
      const settings = {};
      const [head, ...rest] = keyPath.split('.');
      settings[head] = { [rest.join('.')]: value };
      config.setRootSettings(ROOT_A, settings, path.join(ROOT_A, '.chevron', 'config.json'));

      const expected = untrusted ? value : config.get(keyPath);
      assert.deepStrictEqual(config.get(keyPath, { root: FILE }), expected);
      assert.strictEqual(
        config.getSourceOf(keyPath, { root: FILE }).source,
        untrusted ? 'root' : 'default'
      );
      assert.deepStrictEqual(
        config.getWithheldRootKeys(ROOT_A),
        untrusted ? [] : [keyPath]
      );
    });

    it(`${keyPath} from a trusted root: applies`, () => {
      const settings = {};
      const [head, ...rest] = keyPath.split('.');
      settings[head] = { [rest.join('.')]: value };
      config.setRootTrusted(ROOT_A, true);
      config.setRootSettings(ROOT_A, settings);
      assert.deepStrictEqual(config.get(keyPath, { root: FILE }), value);
      assert.strictEqual(config.getSourceOf(keyPath, { root: FILE }).source, 'root');
      assert.deepStrictEqual(config.getWithheldRootKeys(ROOT_A), []);
    });
  }

  it('trusting a root applies what it held back, without reloading it', () => {
    config.setRootSettings(ROOT_A, { lsp: { formatOnSave: true }, editor: { tabLength: 2 } });
    assert.strictEqual(config.get('lsp.formatOnSave', { root: FILE }), false);

    let rootEvents = 0;
    config.onDidChangeRootSettings(() => rootEvents++);
    config.setRootTrusted(ROOT_A, true);
    assert.strictEqual(config.get('lsp.formatOnSave', { root: FILE }), true);
    assert.strictEqual(config.get('editor.tabLength', { root: FILE }), 2);
    assert.strictEqual(rootEvents, 1, 'editors re-resolve on the usual event');

    config.setRootTrusted(ROOT_A, true);
    assert.strictEqual(rootEvents, 1, 'no change, no event');

    config.setRootTrusted(ROOT_A, false);
    assert.strictEqual(config.get('lsp.formatOnSave', { root: FILE }), false);
    assert.deepStrictEqual(config.getWithheldRootKeys(ROOT_A), ['lsp.formatOnSave']);
  });

  it('holds back scoped settings selector by selector', () => {
    config.setRootSettings(ROOT_A, {
      '.source.js': { editor: { tabLength: 2 }, lsp: { formatOnSave: true } }
    });
    assert.strictEqual(
      config.get('editor.tabLength', { root: FILE, scope: JS_SCOPE }),
      2
    );
    assert.strictEqual(
      config.get('lsp.formatOnSave', { root: FILE, scope: JS_SCOPE }),
      false
    );
    config.setRootTrusted(ROOT_A, true);
    assert.strictEqual(
      config.get('lsp.formatOnSave', { root: FILE, scope: JS_SCOPE }),
      true
    );
  });

  it('keeps the allowed half of a namespace and holds back the rest', () => {
    config.setRootSettings(ROOT_A, {
      core: { fileEncoding: 'latin1', disabledPackages: ['tree-view'] }
    });
    assert.strictEqual(config.get('core.fileEncoding', { root: FILE }), 'latin1');
    assert.deepStrictEqual(config.get('core.disabledPackages', { root: FILE }), []);
    assert.deepStrictEqual(config.getWithheldRootKeys(ROOT_A), ['core.disabledPackages']);
  });

  it('says when the value in use is not the one the root asked for', () => {
    const file = path.join(ROOT_A, '.chevron', 'config.json');
    config.set('lsp.formatOnSave', true);
    config.setRootSettings(ROOT_A, { lsp: { formatOnSave: false } }, file);
    const source = config.getSourceOf('lsp.formatOnSave', { root: FILE });
    assert.strictEqual(source.source, 'user');
    assert.strictEqual(source.withheldBy, file);
    assert.strictEqual(
      config.getSourceOf('editor.tabLength', { root: FILE }).withheldBy,
      undefined,
      'and only then'
    );
  });

  it('trust is per root: a trusted sibling does not trust its neighbour', () => {
    const sibling = path.join(path.sep, 'repo', 'b');
    config.setRootTrusted(sibling, true);
    config.setRootSettings(ROOT_A, { lsp: { formatOnSave: true } });
    config.setRootSettings(sibling, { lsp: { formatOnSave: true } });
    assert.strictEqual(config.get('lsp.formatOnSave', { root: FILE }), false);
    assert.strictEqual(
      config.get('lsp.formatOnSave', { root: path.join(sibling, 'x.js') }),
      true
    );
  });
});

describe('the document and the code agree', () => {
  it('documents the order the code implements', () => {
    const fs = require('fs');
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'reference', 'config-precedence.md'),
      'utf8'
    );
    assert.match(doc, /The source outranks the specificity/);
    assert.match(doc, /longest matching root path/i);
    assert.match(doc, /getSourceOf/);
    assert.match(doc, /onDidChangeRootSettings/);
    assert.match(doc, /## Trust/);
    for (const key of ['editor', 'whitespace', 'core.fileEncoding', 'line-ending-selector']) {
      assert.ok(doc.includes(`\`${key}`), `the trust section lists ${key}`);
    }

    const source = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
    assert.match(
      source,
      /docs\/reference\/config-precedence\.md/,
      'config.js should point at the table it implements'
    );
  });
});
