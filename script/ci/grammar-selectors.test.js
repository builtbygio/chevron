'use strict';

/**
 * Every node type a tree-sitter grammar's scope map or folds name is one its
 * parser can produce.
 *
 * A selector naming a renamed node does not error; it just never matches, and
 * the text loses its highlighting or fold. The parser bumps for the
 * tree-sitter 0.25 runtime renamed dozens (`fragment` to `document`,
 * `method_call` to `call`, `symbol` to `simple_symbol`, ...), and each one was
 * found only by noticing uncolored text.
 *
 * The parser's own src/node-types.json is the list of what can appear.
 * Needs a bootstrapped node_modules.
 *
 * Run: node --test script/ci/grammar-selectors.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGES = path.join(ROOT, 'packages');

// `parser` is a package name, optionally with a subpath for multi-grammar
// packages (tree-sitter-typescript/tsx, tree-sitter-markdown/bindings/node/inline).
function nodeTypesFile(parser, grammarFile) {
  const parts = parser.split('/');
  const scoped = parser.startsWith('@');
  const pkgName = parts.slice(0, scoped ? 2 : 1).join('/');
  const sub = parts.slice(scoped ? 2 : 1).join('/');
  const paths = [path.dirname(grammarFile), ROOT];
  let dir;
  try {
    dir = path.dirname(require.resolve(`${pkgName}/package.json`, { paths }));
  } catch (error) {
    dir = path.dirname(require.resolve(pkgName, { paths }));
    while (!fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  }
  let candidates;
  if (/bindings\/node\/inline$/.test(sub)) {
    candidates = [path.join(dir, 'tree-sitter-markdown-inline', 'src', 'node-types.json')];
  } else if (pkgName.endsWith('tree-sitter-markdown') && !sub) {
    candidates = [path.join(dir, 'tree-sitter-markdown', 'src', 'node-types.json')];
  } else if (sub) {
    candidates = [path.join(dir, sub, 'src', 'node-types.json'), path.join(dir, sub, 'node-types.json')];
  } else {
    candidates = [path.join(dir, 'src', 'node-types.json')];
  }
  return candidates.find(c => fs.existsSync(c));
}

// Named types as-is, anonymous tokens quoted, as selectors write them.
function nodeTypes(file) {
  const set = new Set();
  const walk = list => {
    for (const t of list) {
      set.add(t.named ? t.type : JSON.stringify(t.type));
      if (t.children) walk(t.children.types);
      if (t.fields) for (const f of Object.values(t.fields)) walk(f.types);
      if (t.subtypes) walk(t.subtypes);
    }
  };
  walk(JSON.parse(fs.readFileSync(file, 'utf8')));
  return set;
}

// The node references in a selector list, quoted tokens kept whole.
function selectorRefs(selector) {
  const refs = [];
  for (const part of selector.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const re = /"(?:[^"\\]|\\.)*"|[A-Za-z_]\w*/g;
    const cleaned = part.replace(/:[a-z-]+\([^)]*\)/g, '');
    let m;
    while ((m = re.exec(cleaned))) {
      refs.push(m[0].startsWith('"') ? JSON.stringify(JSON.parse(m[0])) : m[0]);
    }
  }
  return refs;
}

function treeSitterGrammars() {
  const grammars = [];
  for (const pkg of fs.readdirSync(PACKAGES)) {
    const dir = path.join(PACKAGES, pkg, 'grammars');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(dir, name);
      const grammar = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (grammar.parser) grammars.push({ file, grammar });
    }
  }
  return grammars;
}

describe('tree-sitter grammar selectors', () => {
  const grammars = treeSitterGrammars();

  it('finds the grammars', () => {
    assert.ok(grammars.length >= 30, `only ${grammars.length} grammars found`);
  });

  for (const { file, grammar } of grammars) {
    const rel = path.relative(ROOT, file);
    it(`${rel} names only real node types`, () => {
      const typesFile = nodeTypesFile(grammar.parser, file);
      assert.ok(typesFile, `no node-types.json for ${grammar.parser}`);
      const types = nodeTypes(typesFile);
      const missing = new Set();
      const check = (ref, where) => {
        if (!types.has(ref)) missing.add(`${ref} (${where})`);
      };

      for (const selector of Object.keys(grammar.scopes || {})) {
        for (const ref of selectorRefs(selector)) check(ref, 'scopes');
      }
      for (const fold of grammar.folds || []) {
        for (const t of [].concat(fold.type || [])) check(t, 'folds');
        for (const end of [fold.start, fold.end]) {
          for (const t of [].concat((end && end.type) || [])) {
            if (!types.has(t)) check(JSON.stringify(t), 'folds');
          }
        }
      }

      assert.deepStrictEqual([...missing], [], `${rel}: not in ${path.relative(ROOT, typesFile)}`);
    });
  }
});
