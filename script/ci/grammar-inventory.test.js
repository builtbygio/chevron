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
const MAX_TEXTMATE = 66;
const MAX_SHADOWED = 28;
const MAX_UNIQUE = 38;
const MIN_TREE_SITTER = 35;

// TextMate is the only grammar for these scopes. Every row carries an owner
// decision in docs/reference/language-stack.md §3.
const EXCEPTION_SCOPES = new Set([
  'source.cake',
  'source.coffee',
  'source.csx',
  'source.git-config',
  'source.gotemplate',
  'source.java-properties',
  'source.java.el',
  'source.js.regexp.replacement',
  'source.js.rails source.js.jquery',
  'source.litcoffee',
  'source.mod',
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
  'text.xml.xsl'
]);

// Cannot be ported: they match regexes inside other grammars' scopes.
const INJECTION_SCOPES = new Set(['text.hyperlink', 'text.todo']);

// Shadowed grammars claiming file types their tree-sitter counterpart does
// not. Deleting one of these without moving its file types first drops those
// files to plain text.
// Emptied by moving those file types onto the tree-sitter grammars. The two
// shell entries below stay behind deliberately: PHP's tree-sitter grammar
// already claims `install` and `profile` (Drupal), and it wins them today.
const SHADOWED_WITH_EXTRA_FILE_TYPES = new Set(['source.shell']);

// File types that used to reach a TextMate grammar and now must be claimed by
// the tree-sitter one. Deleting a fallback without this is how `foo.cjs` ends
// up as plain text.
const MOVED_FILE_TYPES = {
  'source.c': ['xpm'],
  'source.clojure': ['org'],
  'source.css': ['css.erb'],
  'source.java': ['bsh'],
  'source.js': ['cjs', 'mjs', 'es6', 'jsm', 'pac'],
  'source.python': ['Snakefile', 'kv', 'rpy', 'tac', 'wscript'],
  'source.ruby': ['Fastfile', 'Vagrantfile', 'gemspec', 'podspec', 'Capfile'],
  'source.shell': ['PKGBUILD', 'bashrc', 'zshrc', 'ksh', 'bats'],
  'text.html.basic': ['htm', 'xhtml', 'shtml'],
  'text.html.erb': ['rhtml']
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
  it('compiles every regex a tree-sitter grammar declares', () => {
    // tree-sitter grammars build these with `new RegExp(value)`, which has no
    // inline flags: a TextMate-style `(?i)` throws at construction and takes
    // the whole grammar with it, silently handing the language to TextMate.
    for (const grammar of grammars.filter(g => g.treeSitter)) {
      const data = JSON.parse(
        fs.readFileSync(path.join(ROOT, grammar.file), 'utf8')
      );
      for (const key of ['firstLineRegex', 'contentRegex', 'injectionRegExp']) {
        const value = data[key];
        if (typeof value !== 'string') continue;
        assert.doesNotThrow(
          () => new RegExp(value),
          `${grammar.file}: ${key} is not a JavaScript regex`
        );
      }
    }
  });

  it('offers no way to choose the TextMate engine', () => {
    // core.useTreeSitterParsers implied the shadowed grammars were a
    // maintained alternative. They are a library the exception list includes,
    // and ten of them had drifted on file types while nobody was choosing.
    for (const rel of ['src/config-schema.js', 'src/grammar-registry.js']) {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.ok(
        !source.includes('useTreeSitterParsers'),
        `${rel} still references core.useTreeSitterParsers`
      );
    }
  });

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

  it('claims the file types the deleted fallbacks used to answer for', () => {
    for (const [scopeName, types] of Object.entries(MOVED_FILE_TYPES)) {
      const grammar = grammars.find(
        g => g.treeSitter && g.scopeName === scopeName
      );
      assert.ok(grammar, `no tree-sitter grammar for ${scopeName}`);
      for (const type of types) {
        assert.ok(
          grammar.fileTypes.has(type),
          `${scopeName} must claim "${type}" — it used to reach the TextMate ` +
            'grammar, which is no longer selectable for this scope'
        );
      }
    }
  });

  it('keeps every TextMate grammar the surviving ones include', () => {
    // 26 of the 42 TextMate-only grammars build on a grammar whose scope also
    // has a tree-sitter version: source.gfm alone includes 21 of them for
    // fenced code blocks. first-mate resolves `include` through its own
    // registry, so a tree-sitter grammar cannot answer for one of these.
    // Known gap, pre-dating this gate: language-rust-bundled ships only a
    // tree-sitter grammar, so ```rust fences in Markdown have no highlighting.
    // Closing it means a TextMate Rust grammar or a tree-sitter Markdown
    // grammar (retirement plan, PR C) — not another fallback.
    const KNOWN_UNRESOLVED = new Set(['source.rust']);
    const present = new Set(textMate.map(g => g.scopeName));
    const missing = [];
    for (const grammar of textMate) {
      const raw = fs.readFileSync(path.join(ROOT, grammar.file), 'utf8');
      for (const [, scope] of raw.matchAll(/"include"\s*:\s*"([^"#$][^"]*)"/g)) {
        const target = scope.split('#')[0];
        if (!target || target.startsWith('$')) continue;
        // Only scopes this catalog is supposed to provide.
        if (!EXCEPTION_SCOPES.has(target) && !treeSitterScopes.has(target)) {
          continue;
        }
        if (KNOWN_UNRESOLVED.has(target)) continue;
        if (!present.has(target)) {
          missing.push(`${grammar.scopeName} includes ${target}`);
        }
      }
    }
    assert.deepEqual(
      missing,
      [],
      'a TextMate grammar was deleted while another one still includes it. ' +
        'Highlighting inside the includer (fenced code, embedded scripts) ' +
        'silently degrades:\n  ' + missing.join('\n  ')
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
