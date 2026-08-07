# Owned package modernization checklist

**Audience:** maintainers modernizing a `builtbygio/*` bundled package  
**Goal:** ownership → security hygiene → gradual modernization under **Chevron-only** product policy  

Pins live in the monorepo root [`package.json`](../package.json). Integration gate is **Chevron CI** (bootstrap → build → smoke), not standalone Atom CI.

---

## Before you start

1. Confirm the package is forked under `builtbygio/<name>` (or the rename, e.g. `autocomplete-chevron-api`).
2. Note the **current pin SHA** in Chevron `package.json`.
3. Open a short issue or use an existing one so the change has a tracking home.
4. Work on a branch in the **package repo** first; only then bump the pin in Chevron.

```bash
# Example: archive-view
git clone git@github.com:builtbygio/archive-view.git
cd archive-view
git checkout -b modern/chevron-baseline <pin-sha>
```

---

## Checklist (per package)

### A. Ownership baseline (do first — small PR)

- [ ] Default branch is clear (`master` or `main`); document if renamed.
- [ ] `package.json` → `"repository": "https://github.com/builtbygio/<pkg>"` (or full git URL object).
- [ ] `"engines": { "chevron": ">=0.6.0" }` (optional `atom` only if still useful for Pulsar; not required).
- [ ] Remove dead Atom installer CI (`UziTech/action-setup-atom`, `atom --test` against dead channels).
- [ ] Optional lightweight CI: `package.json` / `engines` / lint only — **no** full Atom product install.
- [ ] README: one line that this is maintained for **Chevron** (and still Atom-compatible where practical).

### B. Security / Electron 43 hygiene (when touching runtime code)

- [ ] No `electron.remote` / `@electron/remote` — use Chevron IPC / `applicationDelegate` / `atom.*` APIs.
- [ ] No direct `shell.openExternal` with arbitrary schemes — go through `atom.applicationDelegate.openExternal`.
- [ ] No `require('electron')` from package code if avoidable; prefer Atom APIs.
- [ ] FS that needs main trust boundary: prefer existing IPC patterns (see tree-view / fuzzy-finder / settings-view history).
- [ ] Guest / preview HTML: keep Node off; sanitize untrusted content (`dompurify` / `marked` upgrades if this package renders HTML).
- [ ] Native addons: prefer **prebuildify + `node-gyp-build`** over deprecated `prebuild-install` (see [cpm-prebuilds.md](./cpm-prebuilds.md)).

### C. Modernization / optimization (iterative)

- [ ] Prefer TypeScript or modern JS for new code; optional gradual TS for existing `lib/`.
- [ ] Drop CoffeeScript if any remains (Chevron runtime still *can* transpile community Coffee; owned packages should not rely on it).
- [ ] CSON → JSON for keymaps/menus/grammars/snippets shipped in the package.
- [ ] Remove dead deps; bump transitive SCA hotspots when you touch the package (see [sca-runtime-inventory.md](./sca-runtime-inventory.md)).
- [ ] Avoid reintroducing `request`, ancient Babel, or unmaintained native stacks without a plan.
- [ ] Performance: profile only when there is a measured issue (startup, large trees, search).

### D. Land in Chevron monorepo

- [ ] Push commit(s) to `builtbygio/<pkg>`.
- [ ] Bump SHA in Chevron root `package.json` (+ lockfile via bootstrap/install).
- [ ] Open Chevron PR: mention package name + old→new SHA.
- [ ] CI: `unit-and-cpm` + platform smoke green.
- [ ] Changelog note under Unreleased if user-visible.

```bash
# In chevron monorepo
# package.json: "archive-view": "git+https://github.com/builtbygio/archive-view.git#<newsha>"
./script/bootstrap-modern   # or targeted lock update
# PR against master
```

### E. Chevron-only package surface

- [ ] Prefer `require('chevron')` and `global.chevron` (not `atom`).
- [ ] Prefer `engines.chevron` and `chevron://` package URIs.
- [ ] Config/home: assume `~/.chevron` / `CHEVRON_HOME`.

---

## Suggested first tranche (product packages)

Work these first if optimizing for ownership payoff:

1. **archive-view** / **image-view** — content handlers  
2. **open-on-github** / **symbols-view** — network / process  
3. **bracket-matcher** / **whitespace** — high daily use  

Already Tier-1 owned (settings-view, tree-view, github, …): continue modernization there too when touching them.

---

## Anti-patterns

- Running full Atom CI installers on package repos  
- Force-pushing over SHAs already pinned in production without a Chevron PR  
- Silent major API breaks for community packages that depend on the same package name  
- Claiming “sandboxed editor” while packages still need Node in preload (Phase S Option C)

---

## Related

- [package-ownership-inventory.md](./package-ownership-inventory.md)  
- [package-node-policy.md](./package-node-policy.md)  
- [cpm-prebuilds.md](./cpm-prebuilds.md)  
- [security-phase-s-decision.md](./security-phase-s-decision.md)  
