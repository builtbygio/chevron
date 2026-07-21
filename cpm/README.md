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
./cpm/bin/cpm install git+https://github.com/atom/language-toml.git#master
./cpm/bin/cpm list
./cpm/bin/cpm uninstall cpm-smoke-pure-js
```

Lifecycle scripts are **off** by default (`--allow-scripts` to enable).  
`engines.atom` is checked against Atom-compat **1.65.0** (dual-support); use `--strict` to fail on mismatch.

## Design

See [docs/cpm-design.md](../docs/cpm-design.md) (Phase 1).
