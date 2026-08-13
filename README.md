# Chevron

<p align="center">
  <img src="resources/app-icons/stable/png/256.png" alt="Chevron icon" width="128" height="128" />
</p>

<p align="center"><strong>Hackable. Fast. Yours.</strong></p>

A modernized fork of [Atom](https://github.com/atom/atom), the hackable text editor — resurrected and rebuilt on a current version of Electron.

> Named after the Stargate dialing mechanism: each chevron locks in a step toward a working connection. Fitting for a project that's rebuilding Atom's internals one architectural piece at a time.

## Why

Atom was officially [sunset by GitHub in December 2022](https://github.blog/2022-06-08-sunsetting-atom/) and hasn't received updates since. It shipped on Electron 11, which is years out of date, unsupported, and increasingly incompatible with modern Node.js, V8, and OS-level APIs.

Rather than a from-scratch rewrite, Chevron takes the harder — and more educational — path: bring Atom's existing codebase forward through modern Electron versions, one breaking change at a time.

## Download

**[1.0.1 unsigned preview](https://github.com/builtbygio/chevron/releases/tag/v1.0.1)** — installers are attached to that GitHub Release. Binaries are **not codesigned**; macOS Gatekeeper and Windows SmartScreen will warn.

| Platform | File |
|----------|------|
| Linux x64 | `chevron_1.0.1_amd64.deb`, `chevron.x86_64.rpm`, `chevron-amd64.tar.gz` |
| Linux arm64 | `chevron_1.0.1_arm64.deb`, `chevron.aarch64.rpm`, `chevron-arm64.tar.gz` |
| macOS Intel | `chevron-mac-x64.zip` |
| macOS Apple Silicon | `chevron-mac-arm64.zip` |
| Windows x64 | `chevron-x64-windows.zip` |

All releases: [github.com/builtbygio/chevron/releases](https://github.com/builtbygio/chevron/releases). Details: [docs/releases.md](docs/releases.md).

## Status

**1.0.1 unsigned preview** — modernization 1.0 plus tree-view / archive / owned-package follow-ups. **Owned catalog only**, Phase S **Option C** (editor `sandbox: false` on purpose). This is a dogfoodable preview, not a signed store app.

| Track | Notes |
|-------|--------|
| Electron | **43.1.0** |
| Bundle ID | `dev.builtbygio.chevron` |
| Package API | **Chevron only** (`require('chevron')`, `global.chevron`, `engines.chevron`) |
| Package catalog | **Owned core only**; sandboxed community is host v2 (later) — [docs/package-ecosystem-strategy.md](docs/package-ecosystem-strategy.md) |
| Package manager | **cpm** (Electron-as-Node); `apm` is a **shim → cpm** |
| Updates | **https://github.com/builtbygio/chevron/releases** (unsigned; Check for Update opens this page) |
| Config home | **`~/.chevron`** (`CHEVRON_HOME`; `ATOM_HOME` only if set) |
| Security | Phase S Option C — [docs/security-phase-s-decision.md](docs/security-phase-s-decision.md), [docs/security-threat-model.md](docs/security-threat-model.md) |

See [CHANGELOG.md](CHANGELOG.md) and [docs/REBRANDING.md](docs/REBRANDING.md).

## Goals

- [x] Migrate off deprecated `remote` module usage (IPC path)
- [x] Rearchitect IPC to work under `contextIsolation: true`
- [x] Clean multi-platform builds on current Electron
- [x] Chevron branding (icons, shell, package identity)
- [x] Further first-run / onboarding polish — see [docs/onboarding-polish.md](docs/onboarding-polish.md)
- [x] Modern package manager path — Phase 0–4 complete (`cpm`; see [docs/cpm-design.md](docs/cpm-design.md), [docs/cpm-cutover.md](docs/cpm-cutover.md)); `apm` remains as a cpm shim
- [x] Security Phase N + Electron best-practices shippable scope ([docs/security-phase-n.md](docs/security-phase-n.md), [docs/electron-best-practices-plan.md](docs/electron-best-practices-plan.md))
- [x] Phase S complete under **Option C** (editor `sandbox: false` intentional; utilityProcess git workers; T2 restrict) — [docs/security-phase-s-decision.md](docs/security-phase-s-decision.md)

## Non-goals (for now)

- A ground-up rewrite — this is a modernization effort, not a new editor
- Feature parity with VS Code or other modern editors
- Supporting Atom as a second product identity (Chevron only)

## Approach

Chevron is a modernized fork of Atom, maintained in the open. The goal is not a
from-scratch editor, but a careful forward-port: current Electron, multi-platform
builds, **owned packages under Chevron APIs**, and a security-minded IPC model
(`contextIsolation`, no `remote`).

That path is deliberate. Treating process boundaries, packaging, and native
modules as first-class problems keeps the codebase honest about what still works
and what is still early — without pretending a dependency bump is the whole job.

## Development

Built using a branch → PR → merge workflow, even solo.

**Host toolchain:** Node **24** + Python **3.12** (+ `setuptools`). Always use `./script/bootstrap-modern` (not stock `./script/bootstrap`).

```bash
git clone https://github.com/builtbygio/chevron.git
cd chevron

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap

# macOS: out/Chevron.app (native Intel or Apple Silicon)
# Linux:  --create-debian-package --create-rpm-package --compress-artifacts
#         smoke: xvfb-run -a node script/ci/smoke-test.js
# Windows (Git Bash): same bootstrap/build; smoke: node script/ci/smoke-test.js
```

Platform guides:

- [Linux](docs/build-instructions/linux.md) — `.deb` / `.rpm` / tarball, CI jobs
- [macOS](docs/build-instructions/macOS.md) — Intel + Apple Silicon CI
- [Windows](docs/build-instructions/windows.md) — VS 2022, zip artifact, CI job

## License

Atom was released under the MIT License. This fork retains that license — see [LICENSE.md](LICENSE.md).

## Acknowledgments

Built on the work of the original [Atom](https://github.com/atom/atom) team and community. [Pulsar](https://pulsar-edit.dev/) is the active community-maintained Atom fork focused on immediate usability — worth a look if you want a maintained daily driver today rather than a from-source modernization project.
