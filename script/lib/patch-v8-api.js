'use strict';

/**
 * V8 10.x (Electron 21/22) removed v8::Object::CreationContext(); the
 * replacement is GetCreationContext(), which returns a MaybeLocal.
 * Old natives (tree-sitter runtime, superstring) still use the removed form.
 *
 * Rewrites `->CreationContext()` to `->GetCreationContext().ToLocalChecked()`
 * in both node_modules copies and the vendored packages/ sources (the
 * vendored superstring overwrites node_modules during bootstrap).
 *
 * Idempotent. Usage: node script/lib/patch-v8-api.js [repoRoot]
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(
  process.argv[2] || path.join(__dirname, '..', '..')
);

const ROOTS = [
  'node_modules/superstring/src',
  'packages/superstring/src'
];

const BROKEN = '->CreationContext()';
const FIXED = '->GetCreationContext().ToLocalChecked()';

function* sourceFiles(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) yield* sourceFiles(p);
    else if (/\.(cc|cpp|h)$/.test(ent.name)) yield p;
  }
}

let patched = 0;
for (const root of ROOTS) {
  const abs = path.join(repoRoot, root);
  if (!fs.existsSync(abs)) continue;
  for (const file of sourceFiles(abs)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.includes(BROKEN)) continue;
    fs.writeFileSync(file, text.split(BROKEN).join(FIXED));
    console.log(`patch-v8-api: patched ${path.relative(repoRoot, file)}`);
    patched++;
  }
}

// GCC 15+ / libstdc++ no longer injects uint32_t via transitive headers.
// @atom/fuzzy-native needs an explicit <cstdint> include.
const fuzzyNativeHeader = path.join(
  repoRoot,
  'node_modules/@atom/fuzzy-native/src/MatcherBase.h'
);
if (fs.existsSync(fuzzyNativeHeader)) {
  let text = fs.readFileSync(fuzzyNativeHeader, 'utf8');
  if (!text.includes('<cstdint>')) {
    text = text.replace(
      '#include <memory>\n',
      '#include <cstdint>\n#include <memory>\n'
    );
    fs.writeFileSync(fuzzyNativeHeader, text);
    console.log(
      'patch-v8-api: patched node_modules/@atom/fuzzy-native/src/MatcherBase.h'
    );
    patched++;
  }
}

// V8 15 (Electron 43) removals in registry deps, as exact string swaps.
// - Context::GetIsolate() / Object::GetIsolate() are gone → GetCurrent()
// - WriteUtf8 requires an explicit capacity argument
const REPLACEMENTS = [
  {
    file: 'node_modules/oniguruma/src/onig-scanner.cc',
    from: 'v8::Isolate* isolate = context->GetIsolate();',
    to: 'v8::Isolate* isolate = v8::Isolate::GetCurrent();'
  },
  {
    file: 'node_modules/spellchecker/src/main.cc',
    from: 'Isolate* isolate = exports->GetIsolate();',
    to: 'Isolate* isolate = Isolate::GetCurrent();'
  },
  {
    file: 'node_modules/@atom/fuzzy-native/src/binding.cpp',
    from: 'v8str->WriteUtf8(isolate, &str[0]);',
    to: 'v8str->WriteUtf8(isolate, &str[0], str.size());'
  },
];
for (const { file, from, to } of REPLACEMENTS) {
  const abs = path.join(repoRoot, file);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, 'utf8');
  if (!text.includes(from)) continue;
  fs.writeFileSync(abs, text.split(from).join(to));
  console.log(`patch-v8-api: patched ${file}`);
  patched++;
}

// fuzzy-native: Object::Set is warn_unused_result — use Check() (idempotent).
const fuzzyBinding = path.join(
  repoRoot,
  'node_modules/@atom/fuzzy-native/src/binding.cpp'
);
if (fs.existsSync(fuzzyBinding)) {
  let text = fs.readFileSync(fuzzyBinding, 'utf8');
  const before = text;
  text = text
    .replace(
      /\(void\)array->Set\(context, i, New\(match\.matchIndexes->at\(i\)\)\)(?:\.Check\(\))?;/g,
      'array->Set(context, i, New(match.matchIndexes->at(i))).Check();'
    )
    .replace(
      /(?<![\w.>)])array->Set\(context, i, New\(match\.matchIndexes->at\(i\)\)\);/g,
      'array->Set(context, i, New(match.matchIndexes->at(i))).Check();'
    )
    .replace(
      /\(void\)result->Set\(context, result_count\+\+, obj\)(?:\.Check\(\))?;/g,
      'result->Set(context, result_count++, obj).Check();'
    )
    .replace(
      /(?<![\w.>)])result->Set\(context, result_count\+\+, obj\);/g,
      'result->Set(context, result_count++, obj).Check();'
    );
  if (text !== before) {
    fs.writeFileSync(fuzzyBinding, text);
    console.log(
      'patch-v8-api: patched node_modules/@atom/fuzzy-native/src/binding.cpp (Set Check)'
    );
    patched++;
  }
}

// V8 15 (Electron 43) promoted the WriteV2 signatures: String::Write is now
// Write(isolate, offset, length, buffer, flags). spellchecker (registry dep)
// still uses the removed (isolate, buffer) form; its buffers are Length()+1
// and zero-initialized, so writing Length() units keeps the NUL terminator.
const spellchecker = path.join(
  repoRoot,
  'node_modules/spellchecker/src/main.cc'
);
if (fs.existsSync(spellchecker)) {
  let text = fs.readFileSync(spellchecker, 'utf8');
  const before = text;
  for (const buf of ['text', 'corpus']) {
    text = text
      .split(
        `    string->Write(
#if V8_MAJOR_VERSION > 6
        info.GetIsolate(),
#endif
        reinterpret_cast<uint16_t *>(${buf}.data()));`
      )
      .join(
        `    string->Write(info.GetIsolate(), 0, string->Length(),
        reinterpret_cast<uint16_t *>(${buf}.data()), v8::String::WriteFlags::kNone);`
      );
  }
  if (text !== before) {
    fs.writeFileSync(spellchecker, text);
    console.log('patch-v8-api: patched node_modules/spellchecker/src/main.cc');
    patched++;
  }
}
console.log(`patch-v8-api: done (${patched} files)`);
