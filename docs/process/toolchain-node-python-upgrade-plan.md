# Plan: modern Node + Python for Chevron

**Status:** **T1–T4 complete** on `chore/toolchain-node-python-upgrade` (single PR).  
**Date:** 2026-07-16  
**Audience:** reviewers / future maintainers of the host toolchain

## 1. Baseline (pre-upgrade → post T1–T4)

| Layer | Before | After T1–T4 | Where pinned |
|--------|--------|-------------|--------------|
| **Host Node (bootstrap/build)** | **16.x** only | **24** (accepted 20–24) | `.nvmrc`, `modern-env.sh`, CI `setup-node` |
| **Host Python** | **3.11** only | **3.12** CI pin (+ setuptools; 3.13 OK; 3.11 fallback) | `modern-env.sh`, CI `setup-python` |
| **apm runtime** | **Node 12.14.1** (bundled) | still **Node 12** (install scripts deferred + postinstall under bundled node) | `bootstrap-modern` |
| **apm’s npm / node-gyp** | **npm 6 + node-gyp 5** | unchanged under apm Node 12 | `patch-apm-npm.js`, gyp `rU`→`r` |
| **script/node_modules node-gyp** | **9.x** | **9.x** (+ `fs-admin@0.20`) | `bootstrap-modern` |
| **App runtime** | Electron 43 → Node ~24 | unchanged | `package.json` `electronVersion` |

Important split:

- **Host Node/Python** = what *you* run for bootstrap, apm, gyp, CI.
- **Electron’s Node** = what the shipped app runs. That already “modern.” This plan is about **toolchain modernity**, not app Node (unless you later drop apm).

Key files:

- `.nvmrc`
- `script/lib/modern-env.sh`
- `script/bootstrap-modern`
- `script/with-modern-env`
- `.github/workflows/ci.yml`
- `docs/reference/bootstrap-report.md`
- `GROK.md` (landmines)

---

## 2. Recommended targets (as of 2026-07)

| Tool | Conservative first target | Stretch |
|------|---------------------------|---------|
| **Host Node** | **22 LTS** (or **24 LTS** to align with Electron 43) | Same as Electron major if you want one story |
| **Host Python** | **3.12** (or **3.13** if gyp/setuptools clean) | **3.14** only after 3.12 is green |

Do **not** jump host Node 16 → 24 and Python 3.11 → 3.14 in one PR. Two ladders, or one combined “toolchain rung” with clear abort criteria.

Suggested product of this work:

```text
.nvmrc → 22 (or 24)
CI setup-node → same
CI setup-python → 3.12
modern-env.sh → accept that range; stop hard-pinning only 16 / 3.11
```

---

## 3. What will break (Node host upgrade)

### 3.1 Hard gates in our own scripts

| Break | Why | Fix approach |
|-------|-----|----------------|
| `modern-env.sh` rejects Node ≥18 | Explicit check `_node_major -ge 18` | Raise ceiling; pin major(s) deliberately (e.g. 20–24) |
| `.nvmrc` / CI still on 16 | Workflow + local habit | Bump both together |
| Docs / `GROK.md` landmines | Still say “Node ≠ 16” | Update after green CI |

### 3.2 apm + npm 6 (highest risk)

| Break | Why | Fix approach |
|-------|-----|----------------|
| apm install under modern Node | apm is ancient; may assume old `fs`, `url`, OpenSSL, `process` | Prefer: **run apm under its own Node 12 binary** for *install*, host Node only for `script/*` and modern rebuilds (already partially done) |
| npm 6 rewrites lockfiles | Known landmine (`fix-package-lock.js`) | Keep lock normalizer; re-run on every install; consider generating lock with a fixed npm major |
| `patch-apm-npm.js` patterns | May miss after npm path changes | Treat as canary: if pattern missing, fail bootstrap loudly |
| OpenSSL 3 / TLS defaults | Old git/npm clients vs modern registries | Prefer https remotes (CI already rewrites ssh→https) |

**Strategy preference:**  
Don’t require “apm runs on Node 24.” Require “**bootstrap works on Node 24**,” even if apm subprocess stays on bundled Node 12. That’s the least painful modern host path.

### 3.3 node-gyp / native rebuild

| Break | Why | Fix approach |
|-------|-----|----------------|
| apm’s node-gyp 5 vs Electron 43 headers | Already broken for E20+ | Keep using **script’s node-gyp 9+** for Electron ABI rebuilds (already in bootstrap-modern) |
| Host Node 22/24 building natives for wrong ABI | MODULE_VERSION mismatch (historically: host 16 vs apm 12) | Separate targets: apm natives → Node 12; app natives → Electron 43 |
| Older `nan` / bindings | V8 15 needs modern nan (nested-nan / keytar patches) | Keep patches; re-verify every native after host bump |
| `node-gyp` config.gypi guards | Old gyp rejects new Electron | Modern gyp only for Electron rebuild path |

### 3.4 JS tooling that runs on host Node

| Area | Risk on Node 22/24 | Fix approach |
|------|--------------------|--------------|
| `script/` (coffee-script 1.12, old babel 5, colors, etc.) | Deprecations, occasional hard breaks (`punycode`, `url.parse`, OpenSSL) | Run build; fix or isolate script deps in their own package with engines |
| Root `package-lock` / npm | npm 8/9/10 vs lockfileVersion | Decide: stay on npm 8 for lock stability, or regenerate lock under one npm and stick to it |
| Smoke test / CDP (`ws`, etc.) | Usually fine on modern Node | Low risk |
| Electron packager / asar | Usually fine on 18+ | Validate package step (Helper plist Set-or-Add already fixed) |

### 3.5 What should *not* break (if layers stay separate)

- **Runtime Electron 43** (already Node 24 in-app).
- **Security IPC / Phase N work** (host-toolchain independent).
- **CI action major versions** (actions may run on Node 24; job still installs Node 16 for the build until this plan lands).

---

## 4. What will break (Python upgrade)

### 4.1 Why we’re stuck on 3.11

| Constraint | Detail |
|------------|--------|
| **distutils removed** | Python 3.12+; old node-gyp (5.x, some 9.x configs) still import it |
| **`open(..., 'rU')`** | Removed earlier; we patch gyp `input.py` for 3.11 |
| **Unversioned `python`** | Homebrew is `python3`; old Makefiles (`oniguruma`) call `env python` → shim |

### 4.2 Breaks on 3.12+

| Break | Why | Fix approach |
|-------|-----|----------------|
| node-gyp 5 (apm) fails | No distutils | Don’t use apm’s gyp for modern builds; or install `setuptools` + force modern gyp for all rebuilds |
| node-gyp 9 without setuptools | setuptools no longer always present | `pip install setuptools` in CI/docs; or depend on `node-gyp` that finds python properly |
| `distutils.version` / `LooseVersion` in old gyp | Removed | Newer node-gyp / packaging |
| CFLAGS / Apple clang + gyp | Usually OK on 3.12 | Re-run full native matrix |
| `modern-env.sh` hard-requires 3.11 | Explicit | Accept 3.12+ with fallback order 3.12 → 3.11 |

### 4.3 What “modern Python” does *not* need to mean

We do **not** need the app to embed CPython. Only:

- node-gyp / gyp  
- any Makefile that shells out to `python`  
- CI `setup-python`

---

## 5. Coupling: don’t upgrade in the wrong order

```text
Safe mental model:

  [Host Node]  → runs script/*, CI orchestration, modern node-gyp
  [apm Node 12] → package install (legacy) until apm replaced
  [Electron Node 24] → runtime (already modern)

  [Python] → only for native compile tooling
```

**Bad order:** Bump Python to 3.14 first while still using apm’s node-gyp 5 → bootstrap dies early.  
**Good order:** Modernize gyp path → then Python → then host Node (or Node then Python if gyp path already modern-only).

Recommended sequence:

1. **Inventory natives** (list every `.node` built in bootstrap).  
2. **Make Electron rebuild path independent of apm’s gyp** (mostly done; make it absolute).  
3. **Python 3.12** on CI + local.  
4. **Host Node 22 (or 24)** on CI + local.  
5. Optional later: **replace apm** or run apm only under Node 12 forever.

---

## 6. Phased plan (execution)

### Phase T0 — Inventory & canaries (½–1 day)

- List all natives rebuilt in `bootstrap-modern` / `npm rebuild`.
- Document which tool builds which ABI (apm Node 12 vs Electron 43).
- Note current green: Node 16 + Python 3.11 + macos-15-intel CI.
- Decide targets: e.g. **Node 22 + Python 3.12** as rung 1.

**Exit:** written matrix “component → required Node/Python → owner path.”

### Phase T1 — Python 3.12 (1–3 days)

**Goal:** CI + `modern-env` use 3.12; 3.11 still works as fallback.

| Step | What | Likely break | Fix |
|------|------|--------------|-----|
| T1.1 | CI `python-version: '3.12'` on a branch | gyp/distutils | Ensure only modern node-gyp for Electron rebuild; `pip install setuptools` if needed |
| T1.2 | `modern-env.sh`: prefer 3.12, allow 3.11 | PATH / shim | `python3.12` candidates first; shim `python` → active |
| T1.3 | Keep or drop `rU` patch | Harmless if unused | Keep until no old gyp remains |
| T1.4 | Full bootstrap + build + smoke | Native compile errors | Fix one native at a time; don’t change Node yet |

**Exit:** green CI job with Python 3.12, Node still 16.

### Phase T2 — Host Node 22 (or 24) (2–5 days)

**Goal:** Host bootstrap Node modern; apm still may use Node 12 binary.

| Step | What | Likely break | Fix |
|------|------|--------------|-----|
| T2.1 | Relax `modern-env` Node range (e.g. 20–24) | Scripts assume 16 | Fix failures as they appear |
| T2.2 | CI `node-version: '22'` (or 24) | apm install / npm | Isolate apm: always invoke apm’s `bin/node` / documented env |
| T2.3 | `.nvmrc` → 22 | Local drift | Commit with CI |
| T2.4 | script/ package install under Node 22 | coffee/babel/dep deprecations | Upgrade only what’s required; avoid big lock churn |
| T2.5 | Native rebuild for Electron 43 | ABI / nan | Existing patch pipeline + per-module verify |
| T2.6 | Smoke + packaged app | Packager / Helper plist | Already hardened; re-run |

**Exit:** green CI with Node 22 + Python 3.12; local docs match.

### Phase T3 — Hardening & cleanup (1–2 days)

- Remove “must be Node 16 / Python 3.11” from docs.
- Fail bootstrap if wrong major (clear error, not silent).
- Optional: add `engines` field for host tooling clarity (document only; don’t block Electron).
- Cache keys in CI include node+python majors.

### Phase T4 — Optional follow-ons (later)

| Follow-on | Why | Effort |
|-----------|-----|--------|
| Python 3.13/3.14 | Stay current | Low if T1 solid |
| Node 24 host | Match Electron | Low if T2 on 22 was clean |
| Replace apm / npm 6 | End Node 12 dependency forever | **Large** (weeks) |
| Drop Python shim hacks | Only when no makefile uses `python` | Medium |

---

## 7. Explicit “do not do yet”

- Bumping **Electron** again in the same PR as Node/Python host (confounds failures).
- Regenerating the entire root lockfile “while we’re here” without a dedicated PR.
- Assuming **runtime** needs host Node 24 — it doesn’t.
- Expecting **apm itself** to run on Node 24 without a rewrite.
- Forcing **sandbox: true** / Phase N package Node work in the same change set.

---

## 8. Success criteria

| Criterion | Meaning |
|-----------|---------|
| CI green | `bootstrap-modern --ci` → build → smoke on macos-15-intel |
| Local green | `nvm use` + modern-env → same path |
| Natives present | superstring, pathwatcher, git-utils, tree-sitter*, keytar, etc. |
| apm works | install packages; no MODULE_VERSION mismatch for apm’s own natives |
| Packaged app | smoke test; github worker files if unpack PR merged |
| Docs honest | `.nvmrc`, CI, `modern-env`, GROK landmines agree |

---

## 9. Risk summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| apm/npm 6 brittle on modern host Node | **High** | Keep apm on bundled Node 12; modernize only host orchestration |
| Python 3.12+ kills old gyp | **High** | Modern node-gyp-only rebuild path; setuptools |
| ABI confusion (host vs apm vs Electron) | **High** | Explicit env vars per rebuild step; checklist of MODULE versions |
| Lockfile churn | Medium | Separate PR; pin npm version for installs |
| “It works on my machine” with Homebrew 3.14 default | Medium | modern-env selects exact minor; CI pins exact |

---

## 10. Recommended decision

**Rung 1:**  
**Host Node 22 LTS + Python 3.12**, keep apm’s Node 12 for install, keep Electron 43 rebuilds on modern node-gyp.

**Rung 2:** Host Node 24 (match Electron) once rung 1 is boring.

**Separate epic:** apm replacement / package install without Node 12 — only after toolchain rungs are green.

---

## 11. How to start implementing (future session)

1. Read this file + `script/lib/modern-env.sh` + `.github/workflows/ci.yml` + `docs/reference/bootstrap-report.md`.  
2. Branch e.g. `chore/python-3.12-toolchain` (T1 only).  
3. Do **not** bump Node in the same PR.  
4. Full `bootstrap-modern` + build + smoke before merge.  
5. Then branch `chore/node-22-host` (T2).

---

*Saved for handoff so a future session can execute without re-deriving apm/node-gyp/Electron ABI constraints.*
