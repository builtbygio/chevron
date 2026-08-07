# V8 startup snapshot — investigation and recovery plan

**Status:** plan (proposed)
**Date:** 2026-08-07 (measured 2026-08-08)
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

**Status: ✅ done on macOS Intel — verdict is RESTORE. Linux and Windows pending.**

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

### 4.3 Unplanned finding: the compile cache looks ineffective

Warm start beats cold by only ~500 ms (≈7%). A functioning V8 code cache should
do considerably better. This answers open question §10.3 with *apparently not,
or not usefully* — and per §7 it may be a **cheaper win than the snapshot**.
**Investigate before starting bisection.**

### 4.4 Measurement caveats

- One cold run hit **31.9 s** (first-touch OS/dyld caching on a machine that had just been building). The multi-second conclusion is robust to that noise; **±500 ms build-to-build comparisons are not.**
- No claim is made about whether #81 (dropping runtime transpile) helped: the dominant gap moved 3,386 → 3,004 ms between builds, which is inside the noise of this sample.
- **Platform coverage is incomplete.** Linux and Windows are unmeasured; the module-load gap may differ materially (different filesystem caching, no dyld). Run the harness on both before treating these numbers as the project's startup story.

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
- [ ] Same measurement on **Linux** and **Windows** (harness is cross-platform; `node script/ci/measure-startup.js`).
- [ ] Before/after numbers published for whichever platforms ship the fix.
- [ ] Either: custom snapshot restored and **on by default**, with the fix documented;
      or: a written decision that it stays off, with the measurement that justifies it.
- [ ] `CHEVRON_FORCE_MKSNAPSHOT` retained as an escape hatch either way.
- [ ] **CI guard:** if the snapshot is restored, a build-time assertion that both blobs were installed — silent regression to stock snapshots is exactly how this was lost.
- [ ] `snapshotResult`-dependent code paths in `static/index.js` verified on whichever path ships.

---

## 10. Open questions

1. Is `v8_context_snapshot_generator` strictly required, or can Electron 43 boot from a custom `snapshot_blob.bin` alone? (Determines whether step 3 can simply be dropped.)
2. Does `electron-link@0.6.x` still track Electron/V8 changes, or is it effectively abandoned? A dead linker caps how far this approach can go.
3. ~~Is the code-cache path (`NativeCompileCache`) actually populating today?~~ **Partially answered (§4.3):** warm start beats cold by only ~7% on macOS Intel, which suggests it is not doing useful work. Confirm the mechanism, then fix — likely cheaper than the snapshot.
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
