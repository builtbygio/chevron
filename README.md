# AtomNova

**AtomNova** is a community-driven revival of the [Atom](https://github.com/atom/atom) text editor. We are modernizing the codebase while preserving its legendary hackability.

> **Heritage:** This project is based on Atom 1.65 (Electron 11). GitHub [archived Atom](https://github.blog/2022-06-08-sunsetting-atom/) in December 2022. AtomNova is an independent fork — not affiliated with GitHub.

This project adheres to the Contributor Covenant [code of conduct](CODE_OF_CONDUCT.md).

[![CI](https://github.com/giobuilds/atom-nova/actions/workflows/ci.yml/badge.svg)](https://github.com/giobuilds/atom-nova/actions/workflows/ci.yml)

## Status

| Area | Status |
|------|--------|
| Build on modern macOS | Working (see below) |
| Packaged app launch | Working |
| Rebrand / Electron upgrade | In progress |

Planning docs:

- [Migration checklist](MIGRATION-CHECKLIST.md)
- [Rebranding checklist](docs/REBRANDING.md)
- [Bootstrap / build notes](docs/bootstrap-report.md)

## Building from source

Stock Atom bootstrap does **not** work on current toolchains (Node 18+, Python 3.12+, dead `atom.io` Electron headers). Use the modern wrappers.

### Prerequisites

| Tool | Version / notes |
|------|-----------------|
| **Node.js** | **16.x** (see [`.nvmrc`](.nvmrc)) — use [nvm](https://github.com/nvm-sh/nvm) |
| **Python** | **3.11** (not 3.12+; old node-gyp needs `distutils`) |
| **Git** | Any recent version |
| **C++ toolchain** | macOS: Xcode Command Line Tools; Linux: build-essential + native deps |

**macOS example:**

```sh
# Node 16
nvm install
nvm use          # reads .nvmrc

# Python 3.11 + unversioned `python` for old native builds
brew install python@3.11
mkdir -p ~/.local/bin
ln -sfn "$(brew --prefix python@3.11)/bin/python3.11" ~/.local/bin/python
export PATH="$HOME/.local/bin:$PATH"
```

### Bootstrap and build

```sh
# Install dependencies (script tools, apm, app node_modules)
./script/bootstrap-modern

# Package the app (skips re-bootstrap)
./script/with-modern-env ./script/build --no-bootstrap
```

On macOS, the app is written to:

```text
out/Atom Dev.app
```

Launch:

```sh
open "out/Atom Dev.app"
```

### Important rules

1. Prefer **`./script/bootstrap-modern`** and **`./script/with-modern-env`** over plain `./script/bootstrap` / `./script/build` on modern hosts.
2. Always generate the startup snapshot via a **full** `script/build` run. Do not regenerate the snapshot alone without `prebuild-less-cache` in the same process (that caused a blank window). Details: [docs/bootstrap-report.md](docs/bootstrap-report.md).
3. Electron headers are fetched from `https://www.electronjs.org/headers` (set via `ATOM_ELECTRON_URL`), not the retired atom.io endpoint.

### Dev mode (source tree)

After a successful package build, you can load the repo as resource path:

```sh
"out/Atom Dev.app/Contents/MacOS/Atom Dev" \
  --dev --resource-path="$PWD"
```

## Documentation

- Legacy user guide: [Atom Flight Manual](https://flight-manual.atom.io) (upstream, archived context)
- Bootstrap failures and workarounds: [docs/bootstrap-report.md](docs/bootstrap-report.md)

## License

[MIT](LICENSE.md) — same as original Atom.

When using the Atom or GitHub logos, follow the [GitHub logo guidelines](https://github.com/logos). AtomNova will introduce its own branding separately.
