# Chevron 1.0 unsigned preview

**Status:** 1.0 product contract  
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

| Platform | Typical artifact |
|----------|------------------|
| Linux x64 / arm64 | `.deb`, `.rpm`, `.tar.gz` |
| macOS x64 / arm64 | `chevron-mac-x64.zip` / `chevron-mac-arm64.zip` (unsigned `.app`) |
| Windows x64 | `.zip` |

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
git tag -a v1.0.0 -m "Chevron 1.0.0 unsigned preview"
git push origin v1.0.0
```

The `publish-unsigned-preview` CI job waits for the five-platform matrix, then creates the GitHub Release.

## Dogfood

1.0 starts a **dogfood week**, not a claim that every editor path is polished. Checklist: [dogfood-1.0.md](./dogfood-1.0.md).
