'use strict';

/**
 * Every grammar the catalog ships is a tree-sitter grammar.
 *
 * This file used to be a ratchet over a shrinking TextMate exception list —
 * 69 TextMate grammars across 32 packages, 42 of them the only grammar for
 * their scope. The list is empty now and first-mate is deleted, so the
 * invariant is simpler and stricter: a `grammars/*.json` without
 * `type: "tree-sitter"` cannot be loaded at all (GrammarRegistry#createGrammar
 * throws), which would take the package's activation with it.
 *
 * What that cost is listed in docs/reference/language-stack.md: plain text,
 * sass, the git buffers, go.mod/go.sum and the rest open with no highlighting.
 *
 * Run: node --test script/ci/grammar-inventory.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');

// Every tree-sitter grammar the catalog ships, plus the file types it claims.
const MIN_TREE_SITTER = 35;

// File types that used to reach a TextMate grammar and now must be claimed by
// a tree-sitter one. Deleting a fallback without this is how `foo.cjs` ends up
// as plain text.
const MOVED_FILE_TYPES = {
  'source.c': ['xpm'],
  'source.clojure': ['org'],
  'source.cs': ['csx', 'cake'],
  'source.css': ['css.erb'],
  'source.java': ['bsh'],
  'source.js': ['cjs', 'mjs', 'es6', 'jsm', 'pac'],
  'source.objc': ['mm', 'M'],
  'source.python': ['Snakefile', 'kv', 'rpy', 'tac', 'wscript'],
  'source.ruby': ['Fastfile', 'Vagrantfile', 'gemspec', 'podspec', 'Gemfile'],
  'source.shell': ['PKGBUILD', 'bashrc', 'zshrc', 'ksh', 'bats'],
  'text.html.basic': ['htm', 'xhtml', 'shtml', 'hbs', 'mustache', 'handlebars'],
  'text.html.erb': ['rhtml'],
  'text.xml': ['xsl', 'xslt'],
  'text.xml.plist': ['plist', 'dict']
};

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
      const file = path.join(dir, name);
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      grammars.push({
        pkg,
        file: path.relative(ROOT, file),
        scopeName: data.scopeName,
        treeSitter: data.type === 'tree-sitter',
        fileTypes: new Set(data.fileTypes || []),
        raw: data
      });
    }
  }
  return grammars;
}

const grammars = readGrammars();

describe('grammar inventory', () => {
  it('ships no TextMate grammar', () => {
    const textMate = grammars.filter(g => !g.treeSitter).map(g => g.file);
    assert.deepEqual(
      textMate,
      [],
      'first-mate is deleted, so these cannot load — createGrammar throws on ' +
        'them and takes the package activation with it:\n  ' +
        textMate.join('\n  ')
    );
  });

  it('still ships the tree-sitter grammars', () => {
    assert.ok(
      grammars.length >= MIN_TREE_SITTER,
      `${grammars.length} tree-sitter grammars, down from ${MIN_TREE_SITTER}`
    );
  });

  it('claims the file types the deleted grammars used to answer for', () => {
    for (const [scopeName, types] of Object.entries(MOVED_FILE_TYPES)) {
      const grammar = grammars.find(g => g.scopeName === scopeName);
      assert.ok(grammar, `no grammar for ${scopeName}`);
      for (const type of types) {
        assert.ok(
          grammar.fileTypes.has(type),
          `${scopeName} must claim "${type}" — it used to reach a TextMate ` +
            'grammar, and there is no longer one to reach'
        );
      }
    }
  });

  it('compiles every regex a grammar declares', () => {
    // Grammars build these with `new RegExp(value)`, which has no inline
    // flags: a TextMate-style `(?i)` throws at construction and takes the
    // whole grammar with it, silently leaving the language unhighlighted.
    for (const grammar of grammars) {
      for (const key of ['firstLineRegex', 'contentRegex', 'injectionRegExp']) {
        const value = grammar.raw[key];
        if (typeof value !== 'string') continue;
        assert.doesNotThrow(
          () => new RegExp(value),
          `${grammar.file}: ${key} is not a JavaScript regex`
        );
      }
    }
  });

  it('leaves nothing in src that reaches for the deleted engine', () => {
    const dead = [
      'text-mate-language-mode',
      'pending-text-mate-grammar',
      'load-first-mate',
      'first-mate-helpers'
    ];
    const walk = dir => {
      const out = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.(js|ts)$/.test(entry.name)) out.push(full);
      }
      return out;
    };
    const offenders = [];
    for (const file of walk(path.join(ROOT, 'src'))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const name of dead) {
        if (source.includes(`require('./${name}')`)) {
          offenders.push(`${path.relative(ROOT, file)} requires ${name}`);
        }
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n  '));
  });
});
