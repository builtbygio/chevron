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

| Electron | Default |
|----------|---------|
| &lt; 43 | Attempt custom blob (`electron-link` + `mksnapshot`) when the host can run it |
| **≥ 43** | **Stock Electron V8 snapshots** — generator SIGTRAPs on this app blob |

Force a custom-snapshot attempt:

```bash
CHEVRON_FORCE_MKSNAPSHOT=1 ./script/with-modern-env ./script/build --no-bootstrap
```

Skipped builds write `out/STOCK_V8_SNAPSHOT.txt` (`reason=…`) so CI artifacts show the policy that applied.

Hosts that cannot run `electron-mksnapshot` (linux-arm, win-arm) always use stock snapshots.

See also [startup-snapshot-plan.md](./startup-snapshot-plan.md).
