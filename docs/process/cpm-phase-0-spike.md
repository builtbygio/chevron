# Phase 0 — Step 2 spike results

**Date:** 2026-07-21  
**Branch:** `feat/phase-0-host-npm-bootstrap`  
**Host:** Node 24.18.0 / npm 11.16.0 / Python 3.12.13 (macOS, arch x64)  
**Goal:** Install root app deps with **host npm only** (no apm / Node 12).  

Related: [cpm-phase-0-inventory.md](./cpm-phase-0-inventory.md), [cpm-design.md](../reference/cpm-design.md) §13.5.

> Throwaway experiment. Root `package-lock.json` was **restored** to lockfileVersion 1 after the spike. Do not treat the temporary lock v3 as committed product state.

---

## Commands run

```bash
nvm use   # 24
. script/lib/modern-env.sh

# A — clean-install path
npm ci --ignore-scripts
# → FAIL (exit 1)

# B — install path (reused existing node_modules; did not rm -rf first)
npm install --ignore-scripts --no-audit --no-fund --legacy-peer-deps
# → SUCCESS (exit 0) in ~1m; rewrote package-lock.json to lockfileVersion 3

# C — rebuild sample (after rm keytar.node)
npx electron-rebuild -v 43.1.0 -f -w keytar
# → FAIL (old electron-rebuild@1.11 / node-abi: no Electron 43)

(cd node_modules/keytar && npx node-gyp@11 rebuild \
  --target=43.1.0 --dist-url=https://www.electronjs.org/headers \
  --runtime=electron --arch=x64)
# → FAIL (nan / V8 API — needs bootstrap patches: patch-keytar-nan, patch-nested-nan)
```

---

## Failure buckets

### Bucket L — Lockfile / npm

| Result | Detail |
|--------|--------|
| **`npm ci` fails** on current lockfile | lockfileVersion **1**; npm 11 tries “old lockfile” fix-up, then **`npm error code EUSAGE`** (cannot complete `ci` from this lock) |
| Old-lock metadata issues during fix-up | `ETARGET` for vanished versions (`alter@0.3.0`, `assert-plus@0.3.0`, `performance-now@0.3.0`, `simple-is@0.3.0`, …); `EINTEGRITY` for some (`get-parameter-names@0.3.0`, `random-seed@0.3.0`, `regjsgen@0.3.0`, …) |
| **`npm install` works** | With `--ignore-scripts --legacy-peer-deps`; upgrades lock to **lockfileVersion 3** |
| Implication | **Step 4 (lockfile modernization) is blocking** before CI can use `npm ci`. Expect large lock diff + peer noise; use `--legacy-peer-deps` or equivalent until peers cleaned |

### Bucket P — packageDependencies / layout

| Result | Detail |
|--------|--------|
| **All 91 present** | After host `npm install`, every `packageDependencies` name has `node_modules/<name>/package.json` |
| Aligns with inventory | All 91 already listed under `dependencies` (26× `file:`, 65× git) |
| Implication | **§13.5 Option A is viable** for layout. No apm-only install channel required for bundled package dirs in this spike |

**Caveat:** install was **not** from a wiped `node_modules`. A clean-tree install after lock regen still needs confirmation in Step 4.

### Bucket N — Natives / Electron rebuild

| Result | Detail |
|--------|--------|
| Pre-existing `.node` files | superstring, pathwatcher, git-utils, `@atom/watcher`, keytar were **already** present (left from prior apm/modern bootstrap). **Not proof** of clean host-npm + rebuild |
| Bundled `electron-rebuild@1.11` | **Cannot** target Electron **43** (`node-abi` missing mapping) |
| `node-gyp@11` rebuild of keytar **without** patches | **Fails** (nan / V8 `External::Value` / PropertyCallbackInfo — Electron 43 headers) |
| Implication | Keep bootstrap **patch chain** + **modern gyp force-rebuild** (or upgrade to `@electron/rebuild` with current node-abi). Do **not** rely on stock `electron-rebuild` in root deps as-is |

---

## What this means for Phase 0 plan

| Decision | Recommendation |
|----------|----------------|
| §13.5 packageDependencies | **Option A** (host npm of root `dependencies`) — supported by layout spike |
| Root install command | **Dev:** `npm install --ignore-scripts` (+ peer flags as needed). **CI after lock regen:** `npm ci --ignore-scripts` |
| Lockfile | **Must regenerate** (v3) as its own PR or first commit of Phase 0 implement; cannot keep v1 + host `npm ci` |
| apm for app deps | Removable **after** host install + patches + modern rebuild are wired in `bootstrap-modern` |
| apm for product / user packages | Still required until Phase 1 |
| Custom-transpiler `runApmInstall(package)` | Not exercised this spike; still a build-time apm call site |

---

## Suggested order from here (Steps 3–5)

1. **Step 3** — Record §13.5 = **A** in design (or PR notes).  
2. **Step 4** — Intentional lockfile modernization PR: clean tree, `npm install` → commit lockfileVersion 3; iterate until install is reproducible.  
3. **Step 5** — Wire `bootstrap-modern`: host install helper; keep patches; modern rebuild list; drop default apm install / Node 12 / fix-package-lock for app path.  
4. Clean-tree proof: `rm -rf node_modules && bootstrap-modern` (no apm) + build + smoke.

---

## Environment notes

- Spike did **not** delete `node_modules` first.  
- Spike **did** rewrite then **restore** `package-lock.json` (working tree should match origin lock v1).  
- `keytar.node` may be missing after failed gyp rebuild until next full bootstrap.

---

## Step 2 exit criteria

- [x] Host npm attempted without apm  
- [x] Failures bucketed (lock / packageDeps / natives)  
- [x] §13.5 lean confirmed as Option A  
- [x] Written up for implementers  

## Follow-up (2026-07-21) — implemented

- Lockfile regenerated to **lockfileVersion 3**; `npm ci --ignore-scripts` proven (91/91 packageDependencies).  
- `bootstrap-modern` default path uses host npm; `--with-apm` optional; CI uses `--ci --with-apm` so product still ships apm.  
- Design §13.4 / §13.5 marked resolved.
