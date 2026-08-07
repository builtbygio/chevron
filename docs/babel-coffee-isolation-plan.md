# Babel 5 / CoffeeScript compile-cache isolation plan

**Status:** Option 1 shipped · **Option 2 shipped** (audit P2 / issue #62)  
**Code:** `src/babel.js`, `src/coffee-script.js`, `src/compile-cache.js`, `src/typescript.js`  
**Context:** First-party CoffeeScript is gone; bundled packages that still shipped `lib/*.coffee` are decaffeinated at bootstrap; community packages must not rely on editor-side Coffee.

## Problem

| Stack | Version | Status |
|-------|---------|--------|
| `babel-core` | **5.8.38** | **Still present** — runtime transpile for packages that opt into Babel prefixes |
| `coffee-script` | ~~1.12.7~~ | **Removed** from app dependencies (Option 2) |
| TypeScript | **6.x** | Modern path for owned packages — keep |

Babel 5 remains for ecosystem compatibility (bundled + community packages still use `/** @babel */` / `'use babel'`). CoffeeScript is no longer a product dependency.

## Options

### Option 1 — Hard isolate — **shipped**

Keep compilers loadable but:

1. **Lazy-only** (already true).  
2. **Opt-out env** to refuse legacy transpile (for CI / hardened profiles):  
   - `CHEVRON_DISABLE_LEGACY_TRANSPILE=1` → `.coffee` and Babel-prefix `.js` fail with a clear error; TypeScript unchanged.  
3. **One-shot deprecation log** when Babel 5 actually compiles a file (path in message).  
4. Document for authors: ship plain JS or TS.

### Option 2 — Drop Coffee, keep Babel 5 longer — **shipped**

1. Bootstrap patch decaffeinates the four packageDependencies that still had runtime `lib/*.coffee`:  
   `autocomplete-atom-api`, `autocomplete-css`, `bookmarks`, `wrap-guide`  
   (sources under `script/patches/decaffeinated-bundled-packages/`).  
2. Remove root dependency `coffee-script`.  
3. `src/coffee-script.js` always errors on compile with a migration message (or when hardened env is set).  
4. **cpm** warns on install if a package still ships runtime `.coffee` under `lib/` / `src/`.  
5. Spec-only / maintainer `.coffee` in language packages is ignored at runtime (not loaded as package main).

### Option 3 — Drop both (breaking) — **not yet**

Only after Babel-prefix usage in bundled + community packages is gone (or build-time Babel is enough and runtime babel-core can leave the ASAR). Needs release notes and preferably precompile of remaining `/** @babel */` packages.

### Option 4 — Replace Babel 5 with a modern transpile (large) — **deferred**

`@babel/core` 7+ or esbuild for package JS would need compile-cache key migration and prefix compatibility testing. Defer until after Option 3 planning.

## Decision for Chevron

| Step | State |
|------|--------|
| Option 1 (env + deprecation) | **Done** |
| Option 2 (drop Coffee) | **Done** |
| Option 3/4 | Track under #62 follow-ups / next minor when Babel prefix surface is low |

## Author guidance

- Prefer `engines.atom` / `engines.chevron` packages written in **plain JS or TypeScript**.  
- **Precompile Coffee** before publish — Chevron will not runtime-compile `.coffee`.  
- Do not expect Babel 5 forever; prefer modern syntax that runs on Electron’s Node/V8 without transform, or precompile.  
- Hardened profile: `CHEVRON_DISABLE_LEGACY_TRANSPILE=1` also refuses Babel-prefix transpile.

## Verification

```bash
# Coffee is gone from app deps
node -e "require('coffee-script')"  # should throw MODULE_NOT_FOUND at app root

# Hardened profile (Babel + coffee refuse):
CHEVRON_DISABLE_LEGACY_TRANSPILE=1

# Unit:
node --test script/ci/legacy-transpile.test.js
```

See `src/coffee-script.js` / `src/babel.js` / `src/compile-cache.js` and `script/lib/patch-decaffeinate-bundled-packages.js`.
