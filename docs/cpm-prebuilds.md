# cpm prebuilds (Phase 3)

Prefer **bundled** platform binaries for native packages before compiling with `@electron/rebuild`.

## Install / rebuild order

1. **Already present** `.node` under the package tree  
2. **`chevron.prebuilds` URL** template(s) in the package’s `package.json`  
3. **`prebuildify` + `node-gyp-build`** when the package ships a `prebuilds/` directory and/or depends on `node-gyp-build`  
4. **Legacy `prebuild-install`** only if the *package itself* still declares it (third-party compatibility; **cpm no longer depends on prebuild-install**)  
5. **Source rebuild** via `@electron/rebuild`  

Force source compile:

```bash
cpm rebuild --force-source
# or
cpm rebuild my-native-pkg --force-source
```

## Why not prebuild / prebuild-install

Upstream recommends **prebuildify + node-gyp-build** instead of **prebuild + prebuild-install**:

| Model | How binaries arrive | Install |
|-------|---------------------|---------|
| **prebuildify** | Shipped **inside** the npm package under `prebuilds/` | `node-gyp-build` picks the right one (or rebuilds) |
| **prebuild-install** (legacy) | Extra download from GitHub Releases at install | Separate network step; deprecated client |

Chevron follows that advice for first-party packages and cpm.

## Package author: `chevron.prebuilds` (optional CDN)

```json
{
  "name": "my-native-pkg",
  "version": "1.0.0",
  "chevron": {
    "prebuilds": "https://github.com/org/my-native-pkg/releases/download/v{version}/{name}-{platform}-{arch}-electron{electron}.node"
  }
}
```

Supported tokens: `{name}` `{version}` `{platform}` `{arch}` `{electron}` `{abi}`.

- Single **`.node`** file → written to `build/Release/`.  
- **`.tar.gz`** → extracted into the package root (layout should place `.node` under `build/Release/` or similar).

## Package author: prebuildify + node-gyp-build (preferred)

```json
{
  "scripts": {
    "install": "node-gyp-build",
    "prebuild": "prebuildify --napi --strip",
    "prebuild:electron": "prebuildify --napi --strip --target electron@43.1.0"
  },
  "dependencies": {
    "node-gyp-build": "^4.8.4"
  },
  "devDependencies": {
    "prebuildify": "^6.0.1"
  }
}
```

Publish the package **with** the generated `prebuilds/` folder (do not npmignore it).

At install time cpm sets Electron env (`npm_config_runtime=electron`, `npm_config_target=<version>`) and runs `node-gyp-build`.

## Example GitHub Actions workflow

See [`.github/workflows/cpm-prebuild-example.yml`](../.github/workflows/cpm-prebuild-example.yml). Prefer generating **prebuildify** artifacts into `prebuilds/` and publishing them in the npm tarball; optional release assets can still feed `chevron.prebuilds` URLs.

## Language server binaries (LSP Phase 5)

Separate from Electron native `.node` prebuilds: packages may declare
`chevron.languageServer` + platform `prebuilds` URLs (gzip executables).
cpm fetches them at install into the package tree (e.g. `bin/rust-analyzer`).
See [lsp-server-distribution.md](./lsp-server-distribution.md) and
`cpm/lib/language-server-prebuild.js`.

This path is **opt-in** (`cpm install ./packages/chevron-lsp-rust`); language
servers are never shipped inside the product installer (LSP N1).

## Notes

- Installs still use **`--ignore-scripts`** by default in product bootstrap; prebuilds are applied by **cpm**, not by untrusted install scripts.  
- Headers URL remains `https://electronjs.org/headers` (or product config) for source rebuilds.  
- Prefer bundled prebuilds for cold-start UX; keep source rebuild so packages remain hackable.  
- Transitive third-party packages may still pull deprecated `prebuild-install` until those packages migrate — that is upstream debt, not a cpm dependency.
