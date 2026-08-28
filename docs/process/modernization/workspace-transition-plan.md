# Workspace Transition Plan

## Objective
Move from a fragmented dependency model using `file:` links to a **pnpm workspace** monorepo. This resolves dependency duplication, speeds up installation, and makes local `packages/*` instantly visible to the app.

## Status

| Step | State |
| :--- | :--- |
| `pnpm-workspace.yaml` covering `packages/*` | **Done** |
| Root `file:` → `workspace:*` | **Done** (intermediate) |
| Root in-repo deps → `npm:@builtbygio/<id>@ver` | **Done** (31 app deps; sources remain in `packages/*`) |
| Hoisted `node_modules` (`node-linker=hoisted`, `shamefully-hoist=true`) | **Done** — required so `script/lib/copy-assets.js` and phantom requires keep working |
| Bootstrap (`script/bootstrap-modern`) uses `pnpm install --ignore-scripts` | **Done** |
| CI `pnpm/action-setup` + lockfile hash | **Done** |
| `script/` and `cpm/` stay on npm | **Intentional** — separate lockfiles, not app runtime |
| Git-pinned `builtbygio/*` catalog | **In progress** — in-repo packages are on npm; remaining git SHAs stay until those forks are published |

`packageDependencies` is an Atom/Chevron metadata field (bundled-package list + version labels). It is **not** an install spec. App `dependencies` for in-repo packages use `npm:@builtbygio/<id>@<ver>`; `packageDependencies` stores the matching unscoped semver.

## Tooling: `pnpm`

- Content-addressable store (disk savings).
- Workspace protocol for in-repo packages.
- Hoisted linker so Electron packaging still sees a flat `node_modules`.

## Layout

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```yaml
# pnpm-workspace.yaml (pnpm 11+ settings live here, not in .npmrc)
packages:
  - 'packages/*'
nodeLinker: hoisted
shamefullyHoist: true
strictPeerDependencies: false
blockExoticSubdeps: false
```

```ini
# .npmrc — npm-only (script/ and cpm/ still use npm)
legacy-peer-deps=true
```

## What was not folded into this cutover

- **`apm/`** — deprecated; not a workspace member.
- **`script/`** — build-tool tree, still `npm ci`.
- **`cpm/`** — product package manager, still `npm ci`.
- **Git-pinned packages** — 87 owned SHAs. Publishing them to npm is a separate catalog effort (see `dependency-audit.md`).
- **ESLint / mocha / request** — done; see `security-remediation.md`.

## Daily commands

```bash
nvm use                          # .nvmrc → 24
pnpm install --ignore-scripts    # or ./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
```

CI: `pnpm install --frozen-lockfile --ignore-scripts` (via `script/lib/install-app-dependencies.js`).
