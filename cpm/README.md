# cpm — Chevron Package Manager

Electron-as-Node package installer for Atom-compatible packages.

## Run

Prefer the launchers (they set `ELECTRON_RUN_AS_NODE=1` and the product binary):

```bash
./cpm/bin/cpm doctor
./cpm/bin/cpm list
./cpm/bin/cpm install <name|url|path>
./cpm/bin/cpm rebuild --no-color   # in-package cwd; editor contract
./cpm/bin/apm …                   # compatibility shim → cpm
```

Dev without a built app: set `CHEVRON_EXECUTABLE` or `ELECTRON_PATH` to an Electron binary, or build once so `out/Chevron.app` exists.

## Install cpm deps

```bash
cd cpm && npm install
```

`bootstrap-modern` installs these automatically.

## Install packages (smoke-tested)

```bash
export ATOM_HOME=/tmp/cpm-test   # optional dual home
./cpm/bin/cpm install ./cpm/test/fixtures/pure-js-package
./cpm/bin/cpm install git+https://github.com/builtbygio/language-toml.git#chevron
./cpm/bin/cpm search linter
./cpm/bin/cpm view linter
./cpm/bin/cpm featured --json         # Settings → Install featured list
./cpm/bin/cpm install linter          # registry → tarball
./cpm/bin/cpm list
./cpm/bin/cpm uninstall cpm-smoke-pure-js
```

Lifecycle scripts are **off** by default (`--allow-scripts` to enable).  
`engines.atom` is checked against Atom-compat **1.65.0** (dual-support); use `--strict` to fail on mismatch.

### Registry

Default: **Pulsar** package API (`https://api.pulsar-edit.dev`) — community Atom-compatible packages.

```bash
export CPM_REGISTRY_URL=https://api.pulsar-edit.dev   # optional override
./cpm/bin/cpm search language
./cpm/bin/cpm view language-toml --json
./cpm/bin/cpm featured --json
./cpm/bin/cpm featured --themes --json
```

**In-app Settings** uses the same Pulsar base URL (patched into `settings-view` at bootstrap). Classic `atom.io` is dead and is no longer used.

### Prebuilds

Native packages: cpm tries prebuilds before compiling.

```bash
./cpm/bin/cpm rebuild              # prebuild → source
./cpm/bin/cpm rebuild --force-source
```

Author guide: [docs/orientation/cpm-prebuilds.md](../docs/orientation/cpm-prebuilds.md).

## Design and cutover

- Design (authoritative): [docs/reference/cpm-design.md](../docs/reference/cpm-design.md)  
- User/author cutover: [docs/orientation/cpm-cutover.md](../docs/orientation/cpm-cutover.md)  
- Phases 0–4 are **complete** on `master`.
