'use strict';

/**
 * What the catalog ships to highlight code, and which way it is moving.
 *
 * Every grammar is one of four things, and each has a different cost:
 *
 *   tree-sitter   the default path
 *   shadowed      TextMate for a scope a tree-sitter grammar already owns --
 *                 reachable only via core.useTreeSitterParsers: false
 *   unique        TextMate is the only grammar for that scope; this is the
 *                 exception list in docs/reference/language-stack.md, and it
 *                 is why first-mate ships
 *   injection     TextMate patterns injected into other grammars' scopes
 *                 (hyperlink, todo). Tree-sitter has no equivalent, so these
 *                 cannot be ported -- see the retirement plan
 *
 * A ratchet, not a snapshot: TextMate counts may fall and never rise. The
 * exception list is checked as a set, so a new TextMate-only language cannot
 * arrive unannounced -- adding one means saying so here and in language-stack.
 *
 * Plan: docs/process/textmate-retirement-plan.md
 * Run: node --test script/ci/grammar-inventory.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');

// Baseline at the time of writing. Lower these when grammars are ported or
// deleted; raising one is the failure this file exists to cause.
const MAX_TEXTMATE = 69;
const MAX_SHADOWED = 27;
const MAX_UNIQUE = 42;
const MIN_TREE_SITTER = 30;

// TextMate is the only grammar for these scopes. Every row carries an owner
// decision in docs/reference/language-stack.md §3.
const EXCEPTION_SCOPES = new Set([
  'source.cake',
  'source.coffee',
  'source.csx',
  'source.gfm',
  'source.git-config',
  'source.gotemplate',
  'source.java-properties',
  'source.java.el',
  'source.js.regexp.replacement',
  'source.js.rails source.js.jquery',
  'source.litcoffee',
  'source.makefile',
  'source.mod',
  'source.objc',
  'source.objcpp',
  'source.perl6',
  'source.plist',
  'source.regexp.python',
  'source.ruby.gemfile',
  'source.ruby.rails',
  'source.ruby.rails.rjs',
  'source.sass',
  'source.sassdoc',
  'source.sql.mustache',
  'source.sql.ruby',
  'source.strings',
  'source.sum',
  'text.git-commit',
  'text.git-rebase',
  'text.html.gohtml',
  'text.html.jsp',
  'text.html.mustache',
  'text.html.ruby',
  'text.hyperlink',
  'text.junit-test-report',
  'text.plain',
  'text.python.console',
  'text.python.traceback',
  'text.shell-session',
  'text.todo',
  'text.xml.plist',
  'text.xml.xsl'
]);

// Cannot be ported: they match regexes inside other grammars' scopes.
const INJECTION_SCOPES = new Set(['text.hyperlink', 'text.todo']);

// Shadowed grammars claiming file types their tree-sitter counterpart does
// not. Deleting one of these without moving its file types first drops those
// files to plain text.
const SHADOWED_WITH_EXTRA_FILE_TYPES = new Set([
  'source.c',
  'source.clojure',
  'source.css',
  'source.java',
  'source.js',
  'source.python',
  'source.ruby',
  'source.shell',
  'text.html.basic',
  'text.html.erb'
]);

function readGrammars() {
  const grammars = [];
  for (const pkg of fs.readdirSync(PACKAGES)) {
    const dir = path.join(PACKAGES, pkg, 'grammars');
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch (error) {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.json')) {
        throw new Error(
          `${pkg}/grammars/${name}: grammars are JSON only (CSON is gone)`
        );
      }
      const file = path.join(dir, name);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      grammars.push({
        pkg,
        file: path.relative(ROOT, file),
        scopeName: data.scopeName,
        treeSitter: data.type === 'tree-sitter',
        injection: Boolean(data.injectionSelector),
        fileTypes: new Set(data.fileTypes || [])
      });
    }
  }
  return grammars;
}

const grammars = readGrammars();
const treeSitterScopes = new Set(
  grammars.filter(g => g.treeSitter).map(g => g.scopeName)
);
const textMate = grammars.filter(g => !g.treeSitter);
const shadowed = textMate.filter(g => treeSitterScopes.has(g.scopeName));
const unique = textMate.filter(g => !treeSitterScopes.has(g.scopeName));

const list = items => items.map(g => `${g.scopeName} (${g.file})`).join('\n  ');

describe('grammar inventory', () => {
  it('ships fewer TextMate grammars than the recorded high-water mark', () => {
    assert.ok(
      textMate.length <= MAX_TEXTMATE,
      `${textMate.length} TextMate grammars, up from ${MAX_TEXTMATE}. This ` +
        'number only goes down; a new one needs a row in language-stack.md ' +
        'and a lower baseline here.'
    );
    assert.ok(
      grammars.length - textMate.length >= MIN_TREE_SITTER,
      `${grammars.length - textMate.length} tree-sitter grammars, down from ` +
        `${MIN_TREE_SITTER}`
    );
  });

  it('keeps the fallback set shrinking', () => {
    assert.ok(
      shadowed.length <= MAX_SHADOWED,
      `${shadowed.length} TextMate grammars shadow a tree-sitter grammar, up ` +
        `from ${MAX_SHADOWED}:\n  ${list(shadowed)}`
    );
  });

  it('adds no TextMate-only language without saying so', () => {
    const scopes = new Set(unique.map(g => g.scopeName));
    const added = [...scopes].filter(s => !EXCEPTION_SCOPES.has(s));
    assert.deepEqual(
      added,
      [],
      'these scopes have no tree-sitter grammar and no owner decision. Add ' +
        'a row to docs/reference/language-stack.md §3 and list them here:\n  ' +
        added.join('\n  ')
    );
    assert.ok(
      unique.length <= MAX_UNIQUE,
      `${unique.length} TextMate-only grammars, up from ${MAX_UNIQUE}`
    );
  });

  it('records which exception rows cannot be ported', () => {
    const found = new Set(
      textMate.filter(g => g.injection).map(g => g.scopeName)
    );
    assert.deepEqual(
      [...found].sort(),
      [...INJECTION_SCOPES].sort(),
      'injection grammars match inside other grammars\' scopes, which ' +
        'tree-sitter cannot express. A new one extends the work needed ' +
        'before first-mate can go.'
    );
  });

  it('knows which fallbacks are load-bearing for their file types', () => {
    const withExtras = shadowed
      .filter(g => {
        const ts = grammars.find(
          other => other.treeSitter && other.scopeName === g.scopeName
        );
        return [...g.fileTypes].some(type => !ts.fileTypes.has(type));
      })
      .map(g => g.scopeName)
      .sort();
    assert.deepEqual(
      withExtras,
      [...SHADOWED_WITH_EXTRA_FILE_TYPES].sort(),
      'a shadowed grammar claiming file types its tree-sitter counterpart ' +
        'does not cannot simply be deleted -- the file types move first, or ' +
        'those files open as plain text'
    );
  });
});
