# Chevron

<div align="center">
  
  <p><img src="resources/app-icons/stable/png/256.png" alt="Chevron icon" width="128" height="128" /></p>
  <p><b>Hackable. Fast. Yours.</b></p>

[![CI](https://github.com/builtbygio/chevron/actions/workflows/ci.yml/badge.svg)](https://github.com/builtbygio/chevron/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/builtbygio/chevron)](https://github.com/builtbygio/chevron/releases/latest)
[![License](https://img.shields.io/github/license/builtbygio/chevron)](LICENSE.md)
[![Platform](https://img.shields.io/badge/platform-Linux%20x86__64-informational)](https://github.com/builtbygio/chevron/releases)

</div>

A modernised fork of [Atom](https://github.com/atom/atom), the hackable text editor, resurrected and rebuilt on a current version of Electron.

## Download

**[1.7.0 unsigned preview](https://github.com/builtbygio/chevron/releases/tag/v1.7.0)**: Linux x64 packages are attached to that GitHub Release.

| Platform | File |
|----------|------|
| Linux x64 | `chevron-1.7.0-x64.AppImage` |

All releases: [github.com/builtbygio/chevron/releases](https://github.com/builtbygio/chevron/releases). Details: [docs/reference/releases.md](docs/reference/releases.md). What is planned: [ROADMAP.md](ROADMAP.md).

## Development

Built using a branch → PR → merge workflow, even solo.

**Host toolchain:** Node **24** + Python **3.12** (+ `setuptools`), and pnpm at the version pinned in `package.json` `packageManager`. Always use `./script/bootstrap-modern` (not stock `./script/bootstrap`).

```bash
git clone https://github.com/builtbygio/chevron.git
cd chevron

./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap --create-appimage

# smoke: xvfb-run -a node script/ci/smoke-test.js
```

## License

Atom was released under the MIT License. This fork keeps that licence, see [LICENSE.md](LICENSE.md).

## Acknowledgements

Built on the work of the original [Atom](https://github.com/atom/atom) team and community.
