# Packaging and startup snapshot (Stream D)

**Entry:** `./script/with-modern-env ./script/build --no-bootstrap`  
**Implementation:** `script/lib/package-application.js`, `script/lib/generate-startup-snapshot.js`, `script/lib/packaging-policy.js`

## Packager

The product is assembled with **`electron-packager` 15.x** (script-tree dep). That is the Atom-era packager still in use.

| Topic | Policy |
|-------|--------|
| Identity | `dev.builtbygio.chevron` / helper `dev.builtbygio.chevron.helper` |
| Unpack asar | natives / helpers via `include-path-in-packaged-app` |
| Fuses | `@electron/fuses` after pack (`flip-electron-fuses.js`); soft-fail if missing |
| Linux layout | `<Name>-linux-<arch>/` (smoke + docs) |
| apm | **Not shipped.** `apm` paths are **cpm shims** |
| Migration to `@electron/packager` | **Not in this stream** — API/layout change; separate project |

## Startup snapshot

Custom V8 snapshot is attempted on Linux and Windows whenever the host can run `electron-mksnapshot`. **macOS stays on Electron's stock snapshots** — a custom pair generates cleanly but the process dies at boot on Electron 43 (CI). Electron 43 works when `AtomEnvironment` is **not** constructed during snapshot generation (modules are evaluated into the cache; construction happens at runtime in `installEnvironment()`). `electron-mksnapshot`'s stock `mksnapshot.js` serializes the stock isolate blob for the context generator — Chevron drives both tools from a temp copy that contains the custom `snapshot_blob.bin` (`script/lib/run-mksnapshot.js`).

Skip a custom-snapshot attempt:

```bash
CHEVRON_SKIP_MKSNAPSHOT=1 ./script/with-modern-env ./script/build --no-bootstrap
```

Force one after a skip:

```bash
CHEVRON_FORCE_MKSNAPSHOT=1 ./script/with-modern-env ./script/build --no-bootstrap
```

Failed builds write `out/STOCK_V8_SNAPSHOT.txt` (`reason=…`) so CI artifacts show the policy that applied. A successful custom pair removes that marker. Context blobs ≤ 2 MB are rejected as stock.

Hosts that cannot run `electron-mksnapshot` (linux-arm, win-arm) always use stock snapshots.

See also [startup-snapshot-plan.md](./startup-snapshot-plan.md).
