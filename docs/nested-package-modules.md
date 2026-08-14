# Nested `packages/*/node_modules` policy

**Status:** inventory + policy (audit P2 / issue #64)  
**Note:** Nested `node_modules` under `packages/*` are **not git-tracked** (root `.gitignore` includes `node_modules`). They appear after local `npm install` inside a package directory.

## Inventory (typical local workspace)

| Package | Role | Nested install | Intentional? |
|---------|------|----------------|--------------|
| **watcher** | Native FS watcher | Large (dev + native toolchain) | **Yes** — native package needs own rebuild graph |
| **superstring** | Buffer native | Medium | **Yes** — native |
| dalek, dev-live-reload, link, grammar-selector, welcome, go-to-line, update-package-dependencies, line-ending-selector | In-repo packages | Often **standard** / mocha as devDeps | **No** for product — leftover from package-local lint/test |
| about, git-diff, deprecation-cop, incompatible-packages | Small runtime deps | Small | Prefer hoisting to root when possible |

Sizes fluctuate; re-check with `du -sh packages/*/node_modules`.

## Policy

1. **Product runtime** for monorepo packages should resolve from the **root** `node_modules` / Electron rebuild path used by `bootstrap-modern`.  
2. **Native packages** (`superstring`, `watcher`) may keep local `node_modules` for `node-gyp` / package scripts; document in package README. Official `tree-sitter` lives in the root npm tree.  
3. **Do not commit** nested `node_modules` or nested lockfiles unless there is a strong, written reason (prefer none).  
4. **DevDeps like `standard`** inside in-repo packages: prefer root lint via `script/`; avoid re-installing eslint stacks per package.  
5. After cloning, if a package directory was `npm install`’d by mistake, delete `packages/<name>/node_modules` and re-bootstrap from root.

## Cleanup recipe (local)

```bash
# Remove nested installs for non-native packages (example)
for p in about dalek deprecation-cop dev-live-reload git-diff go-to-line \
  grammar-selector incompatible-packages line-ending-selector link \
  update-package-dependencies welcome; do
  rm -rf "packages/$p/node_modules"
done
# Keep native trees if you are actively developing those packages:
# packages/watcher packages/superstring
```

CI/bootstrap should not rely on those nested trees for the app build.

## Follow-ups

- Trim package-local `devDependencies` that only pull `standard` where unused.  
- Ensure package specs run through monorepo runners, not per-package mocha installs.  
