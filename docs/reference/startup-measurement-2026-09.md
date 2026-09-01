# Startup measurement, September 2026

**Status:** measurement (2026-09-01) — input to step 3 of
[build-architecture.md](../decisions/build-architecture.md)
**Harness:** `script/ci/measure-startup.js`, 5 cold runs per build
**Host:** Linux x64, this workstation. Absolute figures are hardware-specific;
the comparison between the two builds is the part that carries over.

## Why

Step 3 says: *"Bundle core, then re-measure startup. Deletes, if measurement
agrees."* Before bundling core it is worth knowing what bundling 47 packages
already bought, because that is the best available predictor of what bundling
core would buy.

## What was measured

Two builds of the same tree, differing only in whether `bundlePackages()` runs.
Each run uses a fresh `CHEVRON_HOME` and user-data dir, so no config, no
restored window state, no compile-cache carry-over — a genuine cold start.

| | best | median | worst | spread |
|---|---|---|---|---|
| bundled (47 packages) | 1558 | **1577** | 1850 | 292 |
| unbundled | 1638 | **1671** | 1699 | 61 |

Wall clock favours bundling by 94 ms at the median.

## The two numbers disagree

`measure-startup` also reports the internal timeline. On the median run of each
build, the last marker lands at:

| | last marker | wall | unmeasured tail |
|---|---|---|---|
| bundled | **1068 ms** | 1577 ms | 509 ms |
| unbundled | **967 ms** | 1671 ms | 704 ms |

So the instrumented portion is **101 ms slower** bundled, while wall clock is
94 ms faster. The largest single phase moves the same way — `window:initialize`
is +321 ms bundled against +258 ms unbundled.

Largest gaps, median run of each:

```
BUNDLED                              UNBUNDLED
+321  window:initialize:start        +258  window:initialize:start
+180  start-editor-window:end        +162  window:start
+166  window:start                   +160  start-editor-window:end
 +83  electron-onready:end            +78  electron-onready:end
```

## What this does and does not support

**Not supported: that bundling makes startup faster.** The wall-clock win is
inside the noise the bundled build itself shows — its own spread is 292 ms,
three times the difference being claimed, and five times the unbundled spread.
The instrumented phases point the other way.

A plausible reading, untested: a bundle is one large file to parse instead of
many small cached ones, and on a cold run there is no V8 code cache to help,
so parse cost rises while resolution cost falls. That would explain both
numbers. It is a hypothesis, not a finding.

**Supported: bundling should not be justified by startup time.** Its value is
structural — a self-contained artifact that can be signed and installed, which
is what the registry needs. That case does not depend on this measurement, and
should not be argued from it.

**Consequence for step 3:** bundling core should not be expected to speed
startup either, and the snapshot chain should not be deleted on the assumption
that bundling replaces its benefit. Step 3's deletions need their own
measurement against a forced, working snapshot — which is what the plan
already says, and this does not shortcut it.

## Two things checked along the way

**The V8 code cache is working.** `startup-snapshot-plan.md` §7 flags it as
possibly "silently degraded too". It is not: `~/.chevron/blob-store/BLOB` is
1.8 MB with a 70 KB `MAP` after normal use.

Note that it plays no part in the figures above. `blobStore.save()` runs on
unload, and the harness kills the app, so every measured run starts with an
empty cache. That is deliberate — a warmed run would flatter the result — but
it means these numbers are a worst case, not what a user sees on second launch.

**Eager activation is still the largest lever §7 names.** 73 of 86 bundled
packages activate at startup; 13 defer. §7 estimates most are not needed at
first paint. Nothing here changes that, and it remains untried.
