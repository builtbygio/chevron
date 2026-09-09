# Packaging and startup snapshot (Stream D)

**Entry:** `./script/with-modern-env ./script/build --no-bootstrap`  
**Implementation:** `script/lib/package-application.js`, `script/lib/generate-startup-snapshot.js`, `script/lib/packaging-policy.js`

## Packager

The product is assembled with **`@electron/packager` 18.4.4** (script-tree dep). That is the scoped successor of `electron-packager` 15 (same CJS API). 19+ is ESM-only / Node 22.12+ and is a later bump.

| Topic | Policy |
|-------|--------|
| Identity | `dev.builtbygio.chevron` / helper `dev.builtbygio.chevron.helper` |
| Unpack asar | `packaging-policy.js` `asarUnpackExpression()` (`*.node`, dugite, github `lib/**`, `@vscode/ripgrep`). `include-path-in-packaged-app.js` is the **copy** filter, not unpack |
| Fuses | `@electron/fuses` after pack (`flip-electron-fuses.js`); soft-fail if missing |
| Linux layout | `<Name>-linux-<arch>/` (smoke + docs) |
| apm | **Not shipped.** `apm` paths are **cpm shims** |

## macOS universal bundle

The release ships one `Chevron.app` for Intel and Apple Silicon. The two builds are still made on their own hosts (natives compile there; nothing cross-compiles) and merged afterwards:

```bash
./script/mac-universal --x64 path/to/x64/Chevron.app --arm64 path/to/arm64/Chevron.app --compress-artifacts
# -> out/Chevron.app, out/chevron-mac-universal.zip
```

`script/lib/make-mac-universal.js` drives `@electron/universal` (script-tree dep, pinned): Mach-O pairs become fat binaries with `lipo`, everything else must be byte-identical, and the result is checked with `lipo -archs` over the app binary, the framework, the helpers and every `.node` in `app.asar.unpacked`. Two Chevron-specific points:

| Topic | Policy |
|-------|--------|
| One asar | `mergeASARs`. The alternative shim layout renames the archives `app-<arch>.asar`, and node-pty, dugite, the ripgrep searchers and the tree-sitter loader all rewrite the literal `app.asar` to `app.asar.unpacked` to find their binaries |
| Per-arch prebuilds | Packaging drops the foreign arch's `prebuilds/darwin-*` (`packaging-policy.js`), so the unpacked trees differ in which files exist. The missing ones are copied across first; the asar listings may differ there (`singleArchFiles`), and a Mach-O identical on both sides is accepted only there and for the x86_64-only `ctags-darwin` (`x64ArchFiles`) |
| Signature | `lipo` leaves the slices' signatures behind, so the bundle is re-signed: ad-hoc for the unsigned preview (Apple Silicon refuses to start unsigned code), or `--code-sign` for `code-sign-on-mac.js` + notarization |

CI: the `macos-universal` job runs after the two macOS build jobs, smoke-tests the arm64 slice, launches the x86_64 slice under Rosetta where the runner has it, and uploads `chevron-macos-universal`. The release job drops the per-arch zips from the assets.

## Startup snapshot

Custom V8 snapshot is attempted on Linux and Windows whenever the host can run `electron-mksnapshot`. **macOS stays on Electron's stock snapshots** (frozen — architecture Q2; do not staff constructor bisection). CI #125 still dies at process start after installing a valid custom pair. Electron 43 works when `AtomEnvironment` is **not** constructed during snapshot generation (modules are evaluated into the cache; construction happens at runtime in `installEnvironment()`). `electron-mksnapshot`'s stock `mksnapshot.js` serializes the stock isolate blob for the context generator — Chevron drives both tools from a temp copy that contains the custom `snapshot_blob.bin` (`script/lib/run-mksnapshot.js`).

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
