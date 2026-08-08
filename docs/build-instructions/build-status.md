# Chevron build status

CI for this monorepo is **GitHub Actions** (`.github/workflows/ci.yml`), not Azure/CircleCI/AppVeyor Atom pipelines.

| Check | What it does |
|-------|----------------|
| Detect docs-only changes | Skips five-platform matrix when only docs change |
| cpm + unit tests | cpm tests + `script/ci/*.test.js` (incl. bootstrap contract, LSP, pins) |
| macOS x64 / arm64 | `bootstrap-modern --ci` + build + smoke |
| Linux x64 / arm64 | bootstrap + build + packages + smoke (arm64 smoke soft-gated) |
| Windows x64 | bootstrap + build + packages + smoke |

Badge (default branch):

[![CI](https://github.com/builtbygio/chevron/actions/workflows/ci.yml/badge.svg)](https://github.com/builtbygio/chevron/actions/workflows/ci.yml)

## Local build

See [build-modernization.md](../build-modernization.md) and [bootstrap-report.md](../bootstrap-report.md).

```bash
nvm use
./script/bootstrap-modern
./script/with-modern-env ./script/build --no-bootstrap
```

## Historical Atom package badges

Upstream Atom package CI badges are obsolete (atom.io sunset). Owned packages live under `builtbygio/*` pins; see [owned-package-modernization-checklist.md](../owned-package-modernization-checklist.md).
