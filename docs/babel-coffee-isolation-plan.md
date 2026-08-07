# Babel 5 / CoffeeScript compile-cache isolation plan

**Status:** plan (audit P2 / issue #62)  
**Code:** `src/babel.js`, `src/coffee-script.js`, `src/compile-cache.js`, `src/typescript.js`  
**Context:** First-party CoffeeScript is gone; community packages may still ship `.coffee` or `/** @babel */` JS.

## Problem

| Stack | Version | Why it remains |
|-------|---------|----------------|
| `babel-core` | **5.8.38** | Runtime transpile for packages that opt into Babel prefixes |
| `coffee-script` | **1.12.7** | Runtime transpile for `.coffee` in community/legacy packages |
| TypeScript | **6.x** | Modern path for owned packages — keep |

Babel 5 and CoffeeScript are unmaintained, large SCA surface, and slow. They exist only for **ecosystem compatibility**.

## Options

### Option 1 — Hard isolate (recommended near term)

Keep compilers loadable but:

1. **Lazy-only** (already true).  
2. **Opt-out env** to refuse legacy transpile (for CI / hardened profiles):  
   - `CHEVRON_DISABLE_LEGACY_TRANSPILE=1` → `.coffee` and Babel-prefix `.js` fail with a clear error; TypeScript unchanged.  
3. **One-shot deprecation log** when Coffee or Babel 5 actually compiles a file (package name + path).  
4. Document for authors: ship plain JS or TS; do not rely on editor-side Coffee.

### Option 2 — Drop Coffee, keep Babel 5 longer

Coffee is rarer in 2026 community packages than Babel-prefix JS. Dropping Coffee first reduces one dependency; Babel 5 still painful.

### Option 3 — Drop both (breaking)

Only after telemetry/dogfood shows negligible use, with release notes and cpm install warning for packages containing `.coffee`.

### Option 4 — Replace Babel 5 with a modern transpile (large)

`@babel/core` 7+ or esbuild for package JS would need compile-cache key migration and prefix compatibility testing. Defer until after Option 1.

## Decision for Chevron

**Ship Option 1 now** (env + deprecation log + docs).  
**Next minor consideration:** Option 2 (drop Coffee dependency if logs stay quiet).  
**Not yet:** Option 3/4 without evidence.

## Author guidance

- Prefer `engines.atom` / `engines.chevron` packages written in **plain JS or TypeScript**.  
- Precompile Coffee before publish.  
- Do not expect Babel 5 forever; prefer modern syntax that runs on Electron’s Node/V8 without transform.

## Verification

```bash
# Default: legacy transpile still works for community packages
# Hardened profile:
CHEVRON_DISABLE_LEGACY_TRANSPILE=1  # coffee/babel-prefix refused
```

See implementation in `src/coffee-script.js` / `src/babel.js` / `src/compile-cache.js`.
