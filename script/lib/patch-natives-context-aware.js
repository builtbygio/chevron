'use strict';

/**
 * Patch classic NODE_MODULE() natives to NODE_MODULE_CONTEXT_AWARE so they can
 * load in Electron 12+ renderer processes (process model reuse).
 *
 * Idempotent. Safe to re-run after npm/apm installs that restore sources.
 *
 * Usage: node script/lib/patch-natives-context-aware.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));

// name -> relative path to the file containing NODE_MODULE(name, ...)
// Only packages that still use the legacy NODE_MODULE macro.
const TARGETS = [
  {
    file: 'node_modules/pathwatcher/src/main.cc',
    name: 'pathwatcher',
    fn: 'Init',
    arity: 1
  },
  {
    file: 'node_modules/nslog/src/main.cc',
    name: 'nslog',
    fn: 'Init',
    arity: 1
  },
  {
    file: 'node_modules/oniguruma/src/onig-scanner.cc',
    name: 'onig_scanner',
    fn: 'InitModule',
    arity: 1
  },
  {
    file: 'node_modules/git-utils/src/repository.cc',
    name: 'git',
    fn: 'Repository::Init',
    arity: 1
  },
  {
    file: 'node_modules/ctags/src/tags.cc',
    name: 'ctags',
    fn: 'Tags::Init',
    arity: 1
  },
  {
    file: 'node_modules/@atom/fuzzy-native/src/binding.cpp',
    name: 'addon',
    fn: 'Init',
    arity: 1
  },
  {
    file: 'node_modules/spellchecker/src/main.cc',
    name: 'spellchecker',
    fn: 'Init',
    arity: 2
  },
  {
    file: 'packages/superstring/src/bindings/bindings.cc',
    name: 'superstring',
    fn: 'Init',
    arity: 1
  },
  {
    file: 'packages/watcher/src/binding.cpp',
    name: 'watcher',
    fn: 'initialize',
    arity: 1
  },
  {
    file: 'packages/tree-sitter/src/binding.cc',
    name: 'tree_sitter_runtime_binding',
    fn: 'InitAll',
    arity: 1
  }
];

function wrapperCall(fn, arity) {
  if (arity === 2) {
    return `${fn}(exports, v8::Local<v8::Object>::Cast(module));`;
  }
  return `${fn}(exports);`;
}

function makeReplacement(name, fn, arity) {
  const safe = name.replace(/[^A-Za-z0-9_]/g, '_');
  return [
    `static void ${safe}_chevron_register(`,
    `    v8::Local<v8::Object> exports,`,
    `    v8::Local<v8::Value> module,`,
    `    v8::Local<v8::Context> context,`,
    `    void* priv) {`,
    `  ${wrapperCall(fn, arity)}`,
    `}`,
    `NODE_MODULE_CONTEXT_AWARE(${name}, ${safe}_chevron_register)`
  ].join('\n');
}

function patchFile(rel, name, fn, arity) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    console.log(`skip (missing): ${rel}`);
    return false;
  }
  let text = fs.readFileSync(abs, 'utf8');
  if (text.includes(`NODE_MODULE_CONTEXT_AWARE(${name}`)) {
    console.log(`ok (already): ${rel}`);
    return false;
  }

  // NAN_MODULE_INIT modules: just switch the registration macro.
  const nanModule = new RegExp(
    `NODE_MODULE\\(\\s*${name.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}\\s*,\\s*${fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\)\\s*;?`
  );

  if (!nanModule.test(text)) {
    console.log(`skip (no NODE_MODULE): ${rel}`);
    return false;
  }

  // NSFW-style: Init is already context-aware (NAN_MODULE_INIT) — only swap macro.
  if (text.includes(`NAN_MODULE_INIT(${fn})`) || text.includes('NAN_MODULE_INIT(Init)')) {
    text = text.replace(nanModule, `NODE_MODULE_CONTEXT_AWARE(${name}, ${fn})`);
  } else {
    text = text.replace(nanModule, makeReplacement(name, fn, arity));
  }

  fs.writeFileSync(abs, text);
  console.log(`patched: ${rel}`);
  return true;
}

function patchNsfw() {
  const rel = 'node_modules/@atom/nsfw/src/NSFW.cpp';
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return;
  let text = fs.readFileSync(abs, 'utf8');
  if (text.includes('NODE_MODULE_CONTEXT_AWARE(nsfw')) {
    console.log(`ok (already): ${rel}`);
    return;
  }
  if (text.includes('NODE_MODULE(nsfw, NSFW::Init)')) {
    fs.writeFileSync(
      abs,
      text.replace(
        'NODE_MODULE(nsfw, NSFW::Init)',
        'NODE_MODULE_CONTEXT_AWARE(nsfw, NSFW::Init)'
      )
    );
    console.log(`patched: ${rel}`);
  }
}

function patchKeyboardLayout() {
  const rel = 'node_modules/keyboard-layout/src/keyboard-layout-manager.cc';
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return;
  let text = fs.readFileSync(abs, 'utf8');
  const MACRO = 'NAN_MODULE_WORKER_ENABLED(keyboard_layout_manager, init)';

  // Repair output of an earlier buggy patch that consumed the newline before
  // #endif ("unterminated conditional directive" at compile time).
  const glued = new RegExp(
    `#if NODE_MAJOR_VERSION >= 10\\s*\\n\\s*${MACRO.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}\\s*\\n#else\\s*\\n\\s*${MACRO.replace(
      /[.*+?^${}()|[\]\\]/g,
      '\\$&'
    )}#endif`
  );
  if (glued.test(text)) {
    fs.writeFileSync(abs, text.replace(glued, MACRO));
    console.log(`repaired: ${rel}`);
    return;
  }

  // Collapse upstream's version conditional: Node >= 10 is always true on
  // Electron 14+, and replacing only the #else branch corrupts the block.
  const conditional = /#if NODE_MAJOR_VERSION >= 10\s*\n\s*NAN_MODULE_WORKER_ENABLED\(keyboard_layout_manager,\s*init\)\s*\n#else\s*\n\s*NODE_MODULE\(\s*keyboard_layout_manager\s*,\s*init\s*\)\s*;?[^\S\n]*\n#endif/;
  if (conditional.test(text)) {
    fs.writeFileSync(abs, text.replace(conditional, MACRO));
    console.log(`patched (collapsed conditional): ${rel}`);
    return;
  }

  if (text.includes(MACRO)) {
    console.log(`ok (already): ${rel}`);
    return;
  }

  // Bare legacy NODE_MODULE with a Nan init: swap macro, keep the newline.
  if (text.includes('NAN_MODULE_INIT(init)')) {
    const next = text.replace(
      /NODE_MODULE\(\s*keyboard_layout_manager\s*,\s*init\s*\)[^\S\n]*;?[^\S\n]*/,
      MACRO
    );
    if (next !== text) {
      fs.writeFileSync(abs, next);
      console.log(`patched: ${rel}`);
    }
  }
}

// Binding sources are not always at src/binding.cc: tree-sitter-css uses
// bindings/node/binding.cc, tree-sitter-typescript has typescript/src and
// tsx/src. Find every binding.cc in the package (skipping nested deps).
function findBindingSources(dir, depth = 0, results = []) {
  if (depth > 3) return results;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'build') continue;
      findBindingSources(path.join(dir, ent.name), depth + 1, results);
    } else if (ent.name === 'binding.cc') {
      results.push(path.join(dir, ent.name));
    }
  }
  return results;
}

function patchTreeSitterLanguages() {
  const nm = path.join(repoRoot, 'node_modules');
  if (!fs.existsSync(nm)) return;
  for (const ent of fs.readdirSync(nm)) {
    if (!ent.startsWith('tree-sitter-')) continue;
    for (const binding of findBindingSources(path.join(nm, ent))) {
      const rel = path.relative(repoRoot, binding);
      let text = fs.readFileSync(binding, 'utf8');
      if (text.includes('NODE_MODULE_CONTEXT_AWARE')) {
        console.log(`ok (already): ${rel}`);
        continue;
      }
      const m = text.match(
        /NODE_MODULE\(\s*([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_:]+)\s*\)\s*;?/
      );
      if (!m) continue;
      const name = m[1];
      const fn = m[2];
      const arity = /void\s+Init\s*\(\s*Local<\s*Object\s*>\s*\w+\s*,\s*Local<\s*Object\s*>/.test(
        text
      )
        ? 2
        : 1;
      const rep = makeReplacement(name, fn, arity);
      text = text.replace(m[0], rep);
      fs.writeFileSync(binding, text);
      console.log(`patched: ${rel}`);
    }
  }
}

function main() {
  let count = 0;
  for (const t of TARGETS) {
    if (patchFile(t.file, t.name, t.fn, t.arity)) count++;
  }
  patchNsfw();
  patchKeyboardLayout();
  patchTreeSitterLanguages();
  console.log(`context-aware native patches done (${count} core files changed)`);
}

main();
