# Babel 5 / CoffeeScript compile-cache isolation plan

**Status:** Option 1 · 2 · 3 shipped; **stubs deleted (H1 PR 11)**  
**Code:** `src/compile-cache.js` (TypeScript + CSON only), `src/typescript.js`  
**Context:** First-party Coffee/Babel runtime transpile is gone. Compile-cache no longer registers `.coffee` or a Babel-prefix `.js` compiler. Community packages must ship plain JS or TypeScript.

## Problem (historical)

| Stack | Version | Status |
|-------|---------|--------|
| `babel-core` | ~~5.8.38~~ | **Removed** from app dependencies (Option 3). `src/babel.js` **deleted** (PR 11) |
| `coffee-script` | ~~1.12.7~~ | **Removed** from app dependencies (Option 2). `src/coffee-script.js` **deleted** (PR 11) |
| TypeScript | **6.x** | Modern path for owned packages — **keep** |

`.coffee` and Babel-prefix `.js` are now unknown to compile-cache (Node’s default loaders). CSON still goes through `season` in `addPathToCache`.

## Options

### Option 1 — Hard isolate — **shipped, then superseded**

`CHEVRON_DISABLE_LEGACY_TRANSPILE=1` used to refuse Coffee/Babel-prefix compile-cache early. The stubs are gone, so the env is unused.

### Option 2 — Drop Coffee — **shipped**

Owned pins ship precompiled JS. cpm warns on install if runtime `.coffee` is present.

### Option 3 — Drop Babel runtime — **shipped**

No runtime `babel-core`. Prefixes (`/** @babel */`, `'use babel'`, Flow) are not compiled.

### Option 4 — Modern runtime transpile — **not needed**

Prefer precompile + TypeScript.

## Author guidance

- Write packages in **plain JS or TypeScript** (`engines.chevron`).
- **Do not** ship `.coffee`, `/** @babel */`, `'use babel'`, or Flow opt-in for runtime load.
- TypeScript still transpiles via compile-cache (`src/typescript.js`).

## Verification

```bash
node --test script/ci/legacy-transpile.test.js
```

## Related

- Class C bootstrap patches retired; `script/lib/precompile-babel-prefix-files.js` only if a new pin still ships a babel prefix
- cpm install warnings for residual `.coffee` / babel-prefix under `lib/` / `src/`
