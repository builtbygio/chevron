# cpm — Chevron Package Manager

Installs and rebuilds Chevron packages, running under Electron-as-Node so
natives build against Chevron's Electron.

There is no package registry: Chevron ships its packages built in, and
community packages are cancelled ([package-ecosystem-strategy.md](../docs/decisions/package-ecosystem-strategy.md)).
cpm installs a package from a local directory, or links one you are developing.

## Run

Prefer the launcher (it sets `ELECTRON_RUN_AS_NODE=1` and the product binary):

```bash
./cpm/bin/cpm doctor
./cpm/bin/cpm list [--json]
./cpm/bin/cpm install <path> [--force]   # copy a package dir into $CHEVRON_HOME/packages
./cpm/bin/cpm link [path]                # symlink a working copy instead
./cpm/bin/cpm unlink [name]
./cpm/bin/cpm uninstall <name>           # alias: remove
./cpm/bin/cpm rebuild [names...] [--force-source]
```

Dev without a built app: set `CHEVRON_EXECUTABLE` or `ELECTRON_PATH` to an
Electron binary, or build once so `out/` has the app.

## Install cpm deps

```bash
cd cpm && npm install
```

`bootstrap-modern` installs these automatically.

## Installing a package

```bash
./cpm/bin/cpm install ./packages/chevron-lsp-rust
```

`install` copies the directory (not its `node_modules`), then runs
`npm install --omit=dev` in the copy when the package has dependencies, so
their install scripts run. A language-server package also gets its prebuilt
server binary. `--force` replaces an installed package even with an older
version. `engines.chevron` is reported, not enforced.

`link` makes the editor load the working copy directly — right while
developing a package, wrong for installing one.

## Prebuilds

Native packages: `rebuild` tries prebuilds before compiling.

```bash
./cpm/bin/cpm rebuild              # prebuild → source
./cpm/bin/cpm rebuild --force-source
```

Author guide: [docs/orientation/cpm-prebuilds.md](../docs/orientation/cpm-prebuilds.md).

## Design

- [docs/reference/cpm-design.md](../docs/reference/cpm-design.md) — design and history.
  The registry (Phase 2) and `apm` shim it describes are gone (#239).
- [docs/orientation/cpm-cutover.md](../docs/orientation/cpm-cutover.md)
