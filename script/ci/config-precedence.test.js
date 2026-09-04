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

    const source = fs.readFileSync(path.join(ROOT, 'src', 'config.js'), 'utf8');
    assert.match(
      source,
      /docs\/reference\/config-precedence\.md/,
      'config.js should point at the table it implements'
    );
  });
});
