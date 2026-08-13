# Chevron unsigned preview releases

**Status:** 1.0.1 product contract  
**Current tag:** [v1.0.1](https://github.com/builtbygio/chevron/releases/tag/v1.0.1)  
**Update URL:** https://github.com/builtbygio/chevron/releases

This is a **modernization 1.0**, published as an **unsigned preview**. It is not a signed, notarized daily-driver store build.

## What 1.0 is

| Surface | Contract |
|---------|----------|
| Product | **Chevron only** — `global.chevron`, `require('chevron')`, `engines.chevron`, `~/.chevron` |
| Packages | **Owned catalog only** (`builtbygio/*` + monorepo `packages/*`). No community store. |
| Security | Phase S **Option C** — editor Chromium `sandbox: false` (intentional). Community privileged `require` restricted by default. |
| Updates | **GitHub Releases** (this page). In-app Check for Update opens the download page; it does **not** silent-install unsigned bits. |
| Signing | **None.** macOS Gatekeeper and Windows SmartScreen will warn. |

See [package-ecosystem-strategy.md](./package-ecosystem-strategy.md) and [security-phase-s-decision.md](./security-phase-s-decision.md).

## What 1.0 is not

Deferred on purpose (not blockers for this tag):

- Package host v2 / sandboxed community packages
- Mass-fork of `language-*` off `atom/*` ([#79](https://github.com/builtbygio/chevron/issues/79))
- `@electron/packager` migration
- Custom Electron 43 V8 snapshot (stock snapshots are policy)
- Codesign / notarization / Squirrel install feed

A Squirrel-style feed (`CHEVRON_UPDATE_URL_PREFIX` / legacy `ATOM_UPDATE_URL_PREFIX`) stays available for a later signed build. Do not point it at unsigned artifacts.

## Download

CI on tag `v*` builds every platform and attaches artifacts to the GitHub Release (`prerelease: true`).

**1.0.1:** https://github.com/builtbygio/chevron/releases/tag/v1.0.1

| Platform | File |
|----------|------|
| Linux x64 | `chevron_1.0.1_amd64.deb`, `chevron.x86_64.rpm`, `chevron-amd64.tar.gz` |
| Linux arm64 | `chevron_1.0.1_arm64.deb`, `chevron.aarch64.rpm`, `chevron-arm64.tar.gz` |
| macOS Intel | `chevron-mac-x64.zip` (unsigned `.app`) |
| macOS Apple Silicon | `chevron-mac-arm64.zip` (unsigned `.app`) |
| Windows x64 | `chevron-x64-windows.zip` |

Update URL to give users: **https://github.com/builtbygio/chevron/releases**

Env overrides (advanced):

| Env | Role |
|-----|------|
| `CHEVRON_RELEASES_URL` | Human download page (default above) |
| `CHEVRON_RELEASES_API_URL` | GitHub API list used by Check for Update |
| `CHEVRON_UPDATE_URL_PREFIX` | Opt-in Squirrel feed (signed builds only) |

## How to publish a tag

```bash
git checkout master
git pull
git tag -a v1.0.1 -m "Chevron 1.0.1 unsigned preview"
git push origin v1.0.1
```

The `publish-unsigned-preview` CI job waits for the five-platform matrix, then creates the GitHub Release.

## Dogfood

1.0 starts a **dogfood week**, not a claim that every editor path is polished. Checklist: [dogfood-1.0.md](./dogfood-1.0.md).
