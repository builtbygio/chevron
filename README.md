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

## Status

**0.3.0** — multi-platform CI and packaging (Linux x64/arm64 deb+rpm, macOS Intel + Apple Silicon, Windows), Chevron product identity, and new app icon/logo.

Still early: great for building from source and dogfooding; not a polished daily-driver release yet.

| Track | Notes |
|-------|--------|
| Electron | **43.1.0** |
| Bundle ID | `dev.builtbygio.chevron` |
| Package API | Dual-support forever (`atom://`, `global.atom`, `engines.atom`, `apm`) |
| Config home | `~/.atom` by default; `CHEVRON_HOME` / `~/.chevron` supported |

See [CHANGELOG.md](CHANGELOG.md) and [docs/REBRANDING.md](docs/REBRANDING.md).

## Goals

- [x] Migrate off deprecated `remote` module usage (IPC path)
- [x] Rearchitect IPC to work under `contextIsolation: true`
- [x] Clean multi-platform builds on current Electron
- [x] Chevron branding (icons, shell, package identity)
- [x] Further first-run / onboarding polish — see [docs/onboarding-polish.md](docs/onboarding-polish.md)
- [x] Modern package manager path — Phase 0–3 (`cpm` + registry + prebuilds; see [docs/cpm-design.md](docs/cpm-design.md)); Phase 4 retire apm remaining

## Non-goals (for now)

- A ground-up rewrite — this is a modernization effort, not a new editor
- Feature parity with VS Code or other modern editors
- Dropping Atom package compatibility

## Approach

Chevron is a modernized fork of Atom, maintained in the open. The goal is not a
from-scratch editor, but a careful forward-port: current Electron, multi-platform
builds, dual-support for the Atom package ecosystem, and a security-minded IPC
model (`contextIsolation`, no `remote`).

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

Atom was released under the MIT License. This fork retains that license — see [LICENSE](LICENSE).

## Acknowledgments

Built on the work of the original [Atom](https://github.com/atom/atom) team and community. [Pulsar](https://pulsar-edit.dev/) is the active community-maintained Atom fork focused on immediate usability — worth a look if you want a maintained daily driver today rather than a from-source modernization project.
