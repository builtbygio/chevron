# V8 startup snapshot — investigation and recovery plan

**Status:** restored on Linux x64 (2026-08-13) — see §4.8
**Date:** 2026-08-07 (measured 2026-08-08 / 2026-08-13)
**Subject:** `script/lib/generate-startup-snapshot.js` — custom snapshot disabled since the Electron 43 migration
**Related:** [cpm-design.md](./cpm-design.md), [lsp-design.md](./lsp-design.md)

---

## 1. Purpose

Chevron's tagline says **Fast**. Right now that word is unearned: the custom V8
startup snapshot — Atom's single biggest cold-start optimization — is **disabled**,
and the packaged app boots through the plain `require` path.

This plan does three things, in order:

1. **Measure** whether the snapshot is worth restoring at all.
2. If yes, **find the specific cause** with a cheap bisection loop rather than guesswork.
3. **Name the fallbacks** so the milestone can close either way.

It is deliberately an *investigation* plan, not an architecture plan. The
unknown is empirical, and the main risk is spending a week on a 200 ms win.

---

## 2. Current state (precise)

Atom pre-executes its module tree at build time via `electron-link`, then bakes
the initialized heap into V8 snapshot blobs so startup skips parse+execute.
Two tools are involved, and **only the second one fails**:

| Step | Tool | Status on Electron 43 |
|------|------|-----------------------|
| 1. Link ~400k lines into one script | `electron-link@^0.6.0` | ✅ works |
| 2. Embed script into a V8 startup blob | `mksnapshot` | ✅ produces `snapshot_blob.bin` |
| 3. Build the Blink-aware context snapshot from it | `v8_context_snapshot_generator` | ❌ **SIGTRAP / non-zero exit** |

`generate-startup-snapshot.js` handles this by installing **neither** blob —
a custom `snapshot_blob` paired with a stock context snapshot is inconsistent —
and logging a warning. `CHEVRON_FORCE_MKSNAPSHOT=1` re-attempts.

**Consequences today:** slower cold start (unquantified), and `snapshotResult`
is `undefined` at runtime, so every `useSnapshot` branch in `static/index.js`
takes the plain-`require` path — the same path `--dev` always used.

---

## 3. Evidence already gathered

From the Electron 43 migration:

| Experiment | Result | Implication |
|------------|--------|-------------|
| Full Chevron snapshot script | generator SIGTRAPs | baseline failure |
| Trivial script (`var x = {}`) | ✅ passes | not a tooling/setup breakage |
| Synthetic ~5 MB script (40k generated functions) | ✅ passes | **not size-related** |
| Chevron script with `generateSnapshot.call({})` **removed** (definitions only, never executed) | ✅ passes | **the failure is in heap state created by executing the module tree**, not in parsing it |
| Platform spread | seen on Windows **and** Apple Silicon | not arch-specific |

**Conclusion:** something constructed during top-level module execution produces
a heap object the V8 context serializer refuses. This is a *content* bug in a
specific module, and is therefore findable.

---

## 4. Phase 0 — measurement gate

**Status: ✅ done on macOS Intel (RESTORE) and Linux x64 (cheaper alternatives first). Windows still pending.**

### 4.1 Results (2026-08-08)

Harness: `script/ci/measure-startup.js` (launches the packaged app, attaches
over CDP, reads `atom.getStartupMarkers()`).

**Host:** macOS `darwin x64` — Intel Core i5-7360U @ 2.30 GHz, 2 cores (2017).
A slow machine by 2026 standards, so absolute figures are an **upper bound**;
the *proportions* below are the hardware-independent part.

| Metric | Cold home | Warm home |
|--------|-----------|-----------|
| best | 7,171 ms | 6,502 ms |
| **median** | **7,816 ms** | **7,291 ms** |
| Custom V8 snapshot | not in use (stock) | not in use (stock) |

Marker-derived time to `window:onload:end` is **≈5,450 ms**; the wall-clock
figures include ~1.5–2 s of harness attach/poll overhead. Treat ~5.5 s as
"time to workspace ready" and the wall numbers as an upper bound.

**Verdict:** far above the 2,500 ms gate → **proceed to Phase 1.**

### 4.2 Where the time goes (the actionable part)

```text
 2380 ms  window:setup-window:start
 5384 ms  window:initialize:start     ← +3,004 ms  ≈55% of the timeline
 5451 ms  window:onload:end
```

Everything else is well behaved: main process ~1.4 s, window creation ~1 s,
final environment setup ~67 ms. The single 3-second gap is the renderer loading
the module tree through plain `require` — **precisely the work a snapshot
pre-bakes.** The fix is targeted, not diffuse.

### 4.3 Compile cache — writes, but does not buy much

The cache **does** populate when the window unloads (`blobStore.save()` from
`unloadEditorWindow`). After a graceful quit on Linux 1.0.1: **6.0 MB**
`ATOM_HOME/blob-store/BLOB`, **1395** MAP keys.

Warm vs cold on that same home: median wall **2014 ms vs 2148 ms (−6%)**.
`setup-window:start` → `initialize:start` shrank **626 → 520 ms**. The old
macOS Intel ~7% gap is the same story, not a dead cache: `NativeCompileCache`
skips *compile*, and most of the interval is *execute* (`require` of
`initialize-application-window` + `preloadPackages()`).

The original harness **SIGKILL**d the app, which skips `beforeunload` and
never saved the blob. That made earlier “warm” runs look like a broken cache.
`measure-startup.js` now graceful-quits (save + `SIGTERM`) so `--home` reuse
is a real warm compile cache.

### 4.6 Results (2026-08-13) — Linux x64

Harness: same `script/ci/measure-startup.js`, now waiting for
`window:setup-window:end` (workspace ready). Earlier it stopped at
`window:onload:end`, which is written when the onload handler *returns* —
before async `setupWindow()` finishes. On a fast host that cut the timeline
~350 ms short.

**Host:** Linux `x64` — AMD Ryzen 7 5700X 8-Core (16 threads). Packaged
**1.0.1**, stock V8 snapshot (`out/STOCK_V8_SNAPSHOT.txt`).

| Metric | Cold home | Warm home (blob-store reused) |
|--------|-----------|-------------------------------|
| best | 2,114 ms | 2,009 ms |
| **median** | **2,148 ms** | **2,014 ms** |
| Custom V8 snapshot | not in use (stock) | not in use (stock) |

Marker timeline (best cold run, ms since process start):

```text
   279 ms  main-process:atom-window:end
   558 ms  window:start
   581 ms  window:setup-window:start
  1207 ms  window:initialize:start     ← +626 ms  require init + preloadPackages
  1219 ms  start-editor-window:start
  1273 ms  activate-packages           ← +51 ms   activate already-required pkgs
  1324 ms  open-editor
  1582 ms  setup-window:end            ← +258 ms  first empty editor
```

**Verdict (Linux):** **2,148 ms** is in the 1.2–2.5 s band → **§7 cheaper
alternatives first**. There is no single interval that is both >40% of the
timeline *and* >1 s. The require/`preloadPackages` gap is still the largest
slice (~40% of marker time) but it is **626 ms here vs 3,004 ms on the 2017
Mac** — snapshot restore remains the right Mac play, not the first Linux
lever.

Phase 1 greps on `src/` (2026-08-13): no module-scope `Intl` / `WeakRef` /
`FinalizationRegistry`. `Buffer.alloc(0)` in `file-system-blob-store.js` is
constructor-time. `src/lsp/framing.js` has module-scope `Buffer.from` but LSP
is required only after snapshot generation. Snapshot-time execution still
builds `AtomEnvironment` and, when `isGeneratingSnapshot`, `require`s ~50
bundled packages — bisection if we resume Phase 1 for Mac.

### 4.7 Deferred startup packages (2026-08-13)

`preloadPackages()` no longer `require`s every bundled main before first paint.
Heavy packages (`github`, `markdown-preview`, `find-and-replace`,
`settings-view`, `spell-check`, `fuzzy-finder`, …) load/activate on
`requestIdleCallback` after `setup-window:end`. First-paint set stays:
tree-view, tabs, status-bar, welcome, notifications, themes, snippets,
autocomplete, bracket-matcher, language-*.

Same host and harness as §4.6:

| Metric | Before (all preloaded) | After (deferred) |
|--------|------------------------|------------------|
| median wall | 2,148 ms | **1,965 ms** |
| `setup-window:end` (best) | 1,582 ms | **1,103 ms** |
| `setup-window:start` → `initialize:start` | 626 ms | **327 ms** |
| `activate-packages` | 51 ms | 26 ms |
| deferred activate | — | 42 ms *after* first paint |

Workspace-ready marker improved **~480 ms (−30%)**. Wall improved less
because harness attach/poll is a near-constant ~800 ms. Compile-cache
conclusion in §4.3 is unchanged.

A second pass deferred autocomplete / snippets / bracket-matcher and every
`language-*`, and skipped the untitled editor when Welcome will auto-open.
On this host that **did not move** `setup-window:end` (~1100 ms). The leftover
~310 ms `setup-window` → `initialize` interval is mostly core
`require` (`atom-environment`, `text-editor`, `text-editor-component`) plus
the first-paint shell, not grammars. Opening a file before idle still
activates `language-*` immediately.

### 4.8 Custom V8 snapshot restored (2026-08-13)

The generator SIGTRAP was **not** a content-size bug and **not** “Linux
does not need a snapshot.” Findings:

| Experiment | Result |
|------------|--------|
| Trivial script | mksnapshot + generator pass |
| Unminified ~10 MB linked script | **mksnapshot SIGTRAP** (minify first) |
| Minified script, `generateSnapshot.call({})` stripped | mksnapshot + generator pass (~12 MB context) |
| Minified script, modules evaluated, `new AtomEnvironment()` | **generator SIGTRAP** |
| Minified script, modules evaluated, construction deferred to runtime | **pass** (first-paint ~19 MB context; full package list ~31 MB) |

`electron-mksnapshot@43.1.0` `mksnapshot.js` runs
`v8_context_snapshot_generator` with `cwd` = the stock bin directory, so
it serializes the **stock** isolate blob (723 KB). Chevron now drives both
tools from a temp copy that contains the custom `snapshot_blob.bin`
(`script/lib/run-mksnapshot.js`). Context blobs ≤ 2 MB are treated as
stock and rejected.

Product change: `installEnvironment()` constructs `AtomEnvironment` at
runtime. Snapshot-time `require()`s cover first-paint packages only
(`SNAPSHOT_STARTUP_PACKAGES`). `require('chevron')` is a core-module
exclusion so electron-link does not try to open a file named `chevron`.

Default is now **attempt custom snapshot**. `CHEVRON_SKIP_MKSNAPSHOT=1`
keeps the old stock path.

**Linux x64 measurement** (same Ryzen 7 5700X, packaged app, 5 cold runs)
after this restore, on top of the §4.7 deferral:

| Metric | Stock + defer (§4.7) | Custom snapshot + defer |
|--------|----------------------|-------------------------|
| median wall | 1,965–1,995 ms | **2,022 ms** |
| `setup-window:end` | 1,103 ms | **1,137 ms** |
| `setup-window` → `initialize` | 327 ms | **11 ms** |
| `snapshotResult` defined | no | **yes** |

The require interval is gone. Workspace-ready is a wash on this host
because `installEnvironment()` still constructs `AtomEnvironment` and
preloads first-paint packages at runtime (~400 ms
`load-packages` → `deserialize-state`). That constructor heap is what
the generator refuses; baking it is a follow-up bisection. On the 2017
Mac the same module-eval skip is the 3 s gap.

### 4.4 Measurement caveats

- One cold run hit **31.9 s** (first-touch OS/dyld caching on a machine that had just been building). The multi-second conclusion is robust to that noise; **±500 ms build-to-build comparisons are not.**
- No claim is made about whether #81 (dropping runtime transpile) helped: the dominant gap moved 3,386 → 3,004 ms between builds, which is inside the noise of this sample.
- **Platform coverage:** Linux x64 measured (§4.6). Windows still unmeasured.

### 4.5 Amended gate

The original gate keyed on wall-clock total. Measurement showed the useful
signal is **which interval dominates** — 6 s spread evenly across main-process
work would argue for different fixes than 3 s in one renderer interval.
Future gate:

| Condition | Decision |
|-----------|----------|
| A single interval > 40% of the timeline **and** > 1 s | Attack that interval specifically (here: the snapshot) |
| Total > 2,500 ms with no dominant interval | Profile before choosing a fix |
| Total < 1,200 ms | Close as won't-fix-now |

---

### Original gate definition (retained for reference)

**Do not debug this until it is known to be worth debugging.**

Measure packaged cold start, best-of-5, on a quiet machine, all three desktop
platforms, with a fresh `CHEVRON_HOME`:

| Metric | How |
|--------|-----|
| Process start → first paint | existing `StartupTime` markers (`src/startup-time.js`) |
| Process start → workspace usable | marker at `setupWindow()` completion |
| Baseline for comparison | Atom 1.60 on the same hardware, if a build is available |

Then decide with a pre-committed threshold:

| Result | Decision |
|--------|----------|
| Stock-snapshot start **> 2.5 s** | Restore the snapshot; proceed to Phase 1 |
| **1.2–2.5 s** | Proceed, but try §7 cheaper alternatives first |
| **< 1.2 s** | **Close this milestone as won't-fix-now.** Document the measurement, keep the fallback, spend the time on LSP |

Publish the number in the README either way. A measured figure beats an adjective.

---

## 5. Phase 1 — hypothesis pass (hours, not days)

Bisection is the fallback; **look for the usual suspects first.** V8's context
serializer rejects heap objects that reference memory or state it cannot
reproduce. Ranked by likelihood in this codebase:

| # | Hypothesis | Why plausible here | Cheap check |
|---|------------|--------------------|-------------|
| 1 | **Top-level `Buffer` allocation** | Node `Buffer` is a `Uint8Array` over an **external, pooled** allocation. External backing stores are exactly what V8 15 refuses — the *same class of bug* as the tree-sitter memory-cage crash fixed on Electron 22 | grep the linked script for `Buffer.alloc`/`Buffer.from` at module scope |
| 2 | **`Intl` / ICU objects** (`Intl.DateTimeFormat`, `toLocaleString`) built at load | ICU state is not serializable; common in date/number helpers | grep for `Intl.`/`toLocale` at module scope |
| 3 | **Typed arrays over external memory** in non-`.node` JS (e.g. a wasm module, an encoder table) | Same external-backing-store rejection | grep `new (Uint8|Float64|…)Array(` at module scope; look for `WebAssembly` |
| 4 | **Pending promises / microtasks** at snapshot time | Any top-level `async` work leaves an unresolved promise in the heap | grep for top-level `await`, `.then(`, `setTimeout` |
| 5 | **`WeakRef` / `FinalizationRegistry`** | Explicitly unsupported by the serializer | grep |
| 6 | **Native object leakage past the exclusion list** | `.node` requires are excluded, but a JS wrapper may still build an object holding an embedder field | inspect `shouldExcludeModule` coverage |

Each confirmed hit gets added to `shouldExcludeModule` (defer that module to
runtime) and re-tested. Hypotheses 1–3 are strongly favoured; the parse-only
experiment in §3 already proves the trigger is *execution*, which is what these
all have in common.

---

## 6. Phase 2 — bisection harness

If §5 does not land it, bisect — but **only with a fast loop**. A full
`script/build` is ~40 minutes; that makes ~10 iterations unaffordable.

### Harness requirements

`script/snapshot-bisect.js` (dev tool, not shipped):

1. Run **only** `electron-link` + `mksnapshot` + `v8_context_snapshot_generator` — skip transpile, less-compile, packaging, and code signing.
2. Accept an **extra exclusion list** injected into `shouldExcludeModule`.
3. Exit `0`/`1` on generator success/failure, printing the exclusion set.
4. Cache the electron-link output keyed by exclusion set.

**Target: under 3 minutes per iteration.** That makes a ~10-step binary search
over the module tree a single afternoon.

### Procedure

1. Enumerate modules that execute at snapshot time (electron-link already walks the graph — dump the list).
2. Binary search: exclude half, test, recurse into the failing half.
3. Expect ~log₂(N) iterations; with a few hundred modules, ~9–10 runs.
4. Confirm the culprit by excluding **only** that module.
5. Minimize: find the specific top-level statement, and file upstream if the module is third-party.

**Caveat to watch:** exclusions compose. Excluding module A may mask a second
offender in module B. After the first culprit is found, re-run the full set
with only that exclusion to check for a second failure, and repeat.

---

## 7. Alternatives if the snapshot cannot be restored

Ordered by value-per-effort. Several are worth doing **regardless**:

| Option | Effect | Notes |
|--------|--------|-------|
| **V8 code cache** (already present) | Skips *compile*, not execute | `NativeCompileCache` + `FileSystemBlobStore` already run; verify they are actually populating on the no-snapshot path — this may be silently degraded too |
| **Lazy package activation** | Defers a large share of startup work | 91 bundled packages activate eagerly; most are not needed at first paint |
| **Bundled-package diet** | Less to load at all | Overlaps with the cpm/catalog work — moving dev-curiosity packages to optional installs |
| **Deferred `require` in core** | Trims the critical path | Requires profiling to target correctly |
| **Partial snapshot** | Snapshot only the stable subset (e.g. core, no packages) | Smaller blob, likely avoids the offending module entirely — a genuine middle path if bisection stalls |

The **partial snapshot** deserves emphasis: if the culprit turns out to be one
package's module tree and excluding it is unacceptable, snapshotting only
`src/` core may recover most of the win with none of the risk.

---

## 8. Phases and sizing

| Phase | Work | Effort |
|-------|------|--------|
| 0 | Measure cold start on 3 platforms; decide against threshold | ~half a day |
| 1 | Hypothesis pass (§5 greps + targeted exclusions) | ~1 day |
| 2 | Bisection harness + binary search | ~2 days |
| 3 | Permanent fix: exclusion or upstream patch; re-enable by default; CI guard | ~1 day |
| — | *or* §7 alternatives if 1–2 fail | variable |

---

## 9. Success criteria

- [x] Cold-start numbers measured on **macOS Intel** (§4.1) — snapshot absent, 55% of the timeline in one interval.
- [x] Same measurement on **Linux x64** (§4.6) — 2.1 s median; compile cache works (−6%); §7 first.
- [ ] Same measurement on **Windows**.
- [ ] Before/after numbers published for whichever platforms ship the fix.
- [x] Either: custom snapshot restored and **on by default**, with the fix documented (§4.8);
      or: a written decision that it stays off, with the measurement that justifies it.
- [x] `CHEVRON_FORCE_MKSNAPSHOT` retained; `CHEVRON_SKIP_MKSNAPSHOT=1` is the skip hatch.
- [x] **CI guard:** context blob ≤ 2 MB is rejected as stock; failed builds write `STOCK_V8_SNAPSHOT.txt`.
- [x] `snapshotResult`-dependent code paths in `static/index.js` verified on Linux (`measure-startup.js`: `custom V8 snapshot in use: YES`).

---

## 10. Open questions

1. Is `v8_context_snapshot_generator` strictly required, or can Electron 43 boot from a custom `snapshot_blob.bin` alone? (Determines whether step 3 can simply be dropped.)
2. Does `electron-link@0.6.x` still track Electron/V8 changes, or is it effectively abandoned? A dead linker caps how far this approach can go.
3. ~~Is the code-cache path (`NativeCompileCache`) actually populating today?~~ **Yes (§4.3 / §4.6).** 1395 blobs / 6 MB after a graceful quit. Warm start is only ~6–7% faster because the interval is execute, not compile. Not a silent breakage.
4. Does upstream Electron have a supported story for custom app snapshots in 2026, or has that capability quietly bit-rotted for everyone?

---

## 11. Summary

The snapshot failure is **specific and findable**: parsing works, executing
does not, size is irrelevant. The most likely cause is an external-backing-store
object — the same class of bug already fixed once in tree-sitter — created at
module load.

Measurement (§4) has now run on macOS Intel and settles the question: **~5.5 s
to a usable workspace, with 55% of it in a single module-load interval.** That
is over the gate by a wide margin, and the dominant interval is exactly what a
snapshot addresses — so Phase 1 is justified.

Two things temper that: Linux and Windows are still unmeasured, and the compile
cache appears to be underperforming (§4.3), which may be a cheaper win worth
taking first.
