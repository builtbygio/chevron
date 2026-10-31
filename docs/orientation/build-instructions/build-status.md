# Chevron build status

CI for this monorepo is **GitHub Actions** (`.github/workflows/ci.yml`), not Azure/CircleCI/AppVeyor Atom pipelines.

| Check | What it does |
|-------|----------------|
| Detect docs-only changes | Skips the Linux build when only docs change |
| cpm + unit tests | cpm tests + `script/ci/*.test.js` (incl. bootstrap contract, LSP, pins) |
| Linux x64 | bootstrap + build + AppImage + smoke |

CI and GitHub Releases are **Linux x64 only** (no macOS or Windows jobs).

Badge (default branch):

[![CI](https://github.com/builtbygio/chevron/actions/workflows/ci.yml/badge.svg)](https://github.com/builtbygio/chevron/actions/workflows/ci.yml)

## Local build

See [build-modernization.md](../../reference/build-modernization.md) and [bootstrap-report.md](../../reference/bootstrap-report.md).

```bash
nvm use
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
```

## Historical Atom package badges

Upstream Atom package CI badges are obsolete (atom.io sunset). Owned packages live under `builtbygio/*` pins; see [owned-package-modernization-checklist.md](../owned-package-modernization-checklist.md).
