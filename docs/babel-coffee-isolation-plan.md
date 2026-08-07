# Babel 5 / CoffeeScript compile-cache isolation plan

**Status:** Option 1 · 2 · **3 shipped** (audit P2 / issue #62)  
**Code:** `src/babel.js`, `src/coffee-script.js`, `src/compile-cache.js`, `src/typescript.js`  
**Context:** First-party Coffee/Babel runtime transpile removed. Bundled packages precompiled; community packages must ship plain JS or TypeScript.

## Problem (historical)

| Stack | Version | Status |
|-------|---------|--------|
| `babel-core` | ~~5.8.38~~ | **Removed** from app dependencies (Option 3) |
| `coffee-script` | ~~1.12.7~~ | **Removed** from app dependencies (Option 2) |
| TypeScript | **6.x** | Modern path for owned packages — **keep** |

## Options

### Option 1 — Hard isolate — **shipped**

`CHEVRON_DISABLE_LEGACY_TRANSPILE=1` refuses Coffee/Babel-prefix compile-cache early. Still honored as a hardened-profile no-op (both compilers already error).

### Option 2 — Drop Coffee — **shipped**

- Bootstrap decaffeinates `autocomplete-atom-api`, `autocomplete-css`, `bookmarks`, `wrap-guide` (`script/patches/decaffeinated-bundled-packages/`).
- `src/coffee-script.js` always errors on compile.
- cpm warns on install if runtime `.coffee` is present.

### Option 3 — Drop Babel runtime (precompile + drop) — **shipped**

Mirror Coffee: **no runtime `babel-core`**. Sources that used Atom opt-in prefixes were precompiled offline:

| Layer | How |
|-------|-----|
| **Monorepo `packages/*`** | esbuild precompile in tree (dalek, git-diff, welcome, …) |
| **Owned builtbygio forks** | Commits on `chevron/drop-runtime-babel` pinned from Chevron `package.json` (settings-view, find-and-replace, autocomplete-plus, command-palette, tree-view) |
| **Remaining atom/* pins** | Bootstrap patch `script/lib/patch-debabel-bundled-packages.js` + `script/patches/debabelled-bundled-packages/` |

Prefixes no longer supported at runtime:

- `/** @babel */`
- `'use babel'` / `"use babel"`
- `/* @flow */` / `// @flow`

`src/babel.js` detects prefixes and **throws** a migration error (never loads raw ESM/JSX as plain JS).

**Tooling:** `script/lib/precompile-babel-prefix-files.js` (esbuild preferred; babel-core@5 fallback if present) for re-running when pins change.

### Option 4 — Modern runtime transpile — **not needed**

Deferred permanently unless product policy reverses. Prefer precompile + TypeScript.

## Author guidance

- Write packages in **plain JS or TypeScript** (`engines.chevron` / `engines.atom`).
- **Do not** ship `/** @babel */`, `'use babel'`, or Flow opt-in for runtime load.
- Precompile Coffee and Babel-era sources **before publish**.
- TypeScript still transpiles via compile-cache (`src/typescript.js`).

## Verification

```bash
# App deps must not list babel-core / coffee-script
node -e "const p=require('./package.json'); if (p.dependencies['babel-core']||p.dependencies['coffee-script']) process.exit(1)"

# Compilers refuse
node --test script/ci/legacy-transpile.test.js

# Hardened env still short-circuits
CHEVRON_DISABLE_LEGACY_TRANSPILE=1
```

## Related

- Bootstrap: `patch-decaffeinate-bundled-packages.js`, `patch-debabel-bundled-packages.js`
- cpm install warnings for residual `.coffee` / babel-prefix under `lib/` / `src/`
