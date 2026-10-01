# cpm cutover notes (apm → cpm)

**Audience:** Chevron users, packagers, and package authors  
**Status:** Phases 0–4 **complete** (2026-07). The registry from Phase 2 was removed with community packages (#239, 2026-08-29).  
**Design:** [cpm-design.md](../reference/cpm-design.md) · **Prebuilds:** [cpm-prebuilds.md](./cpm-prebuilds.md)

---

## What changed

| Area | Before | After |
|------|--------|--------|
| Package manager | Classic **apm** (bundled Node 12) | **cpm** (Electron-as-Node on the product binary) |
| Command name `apm` | Real apm binary | **Retired** — nothing installs an `apm` name. Use `cpm` |
| App bootstrap (from source) | apm installed root `node_modules` | **pnpm** + modern Electron rebuild |
| Product package contents | `app/apm` = atom-package-manager | **`app/cpm` only** |
| Registry | Dead atom.io | **None.** Packages ship built in; community packages are cancelled ([package-ecosystem-strategy.md](../decisions/package-ecosystem-strategy.md)) |
| Native modules | Fragile Node 12 rebuilds | Prefer **prebuilds**, then `@electron/rebuild` |

Product policy is **Chevron-only** (`global.chevron`, `engines.chevron`, `~/.chevron`).

---

## For users

```bash
cpm install ./path/to/package    # copy into $CHEVRON_HOME/packages
cpm link ./path/to/package       # or load a working copy in place
cpm list
cpm uninstall <name>
cpm doctor
```

There is no install-by-name or from a URL: with no registry there is nothing
to resolve a name against or to verify a download with.

| Variable | Role |
|----------|------|
| `CHEVRON_HOME` (then `ATOM_HOME`) | Config home; packages land in its `packages/`. Default `~/.chevron` |

Settings › Packages lists what is installed and runs uninstall and rebuild
through `getApmPath()` → **cpm**. It has no search or install-from-registry.

---

## For package authors (owned packages)

1. Declare **`engines.chevron`**; cpm reports it on install.
2. Prefer shipping **prebuilds** for native addons — see [cpm-prebuilds.md](./cpm-prebuilds.md) and `.github/workflows/cpm-prebuild-example.yml`.
3. `cpm install` runs `npm install --omit=dev` in the installed copy, so dependency install scripts run.
4. Test with:

   ```bash
   ./cpm/bin/cpm link .
   ./cpm/bin/cpm rebuild --no-color
   ```

---

## For people building Chevron from source

```bash
./script/bootstrap-modern          # installs cpm deps too
./script/with-modern-env ./script/build --no-bootstrap
```

---

## Packaging / distro

- Deb, rpm and install-from-source put **`cpm`** on PATH; no `apm`.
- An install upgraded from an older build may keep a stale `apm.cmd` (Windows); it is not refreshed.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `apm: command not found` | Use `cpm` |
| Native module load failure | `cpm rebuild` in the package dir; prefer prebuilds |

```bash
cpm doctor
```

---

## Phase map (history)

| Phase | Outcome | PR(s) |
|-------|---------|-------|
| 0 | Bootstrap off apm → host npm | #24 |
| 1 | cpm CLI + product wiring | #25, #26, #27 |
| 2 | Registry search / view / install-by-name — **removed in #239** | #28 |
| 3 | Prebuilds before source rebuild | #29 |
| 4 | Classic apm retired from product | #30 |

See also: [cpm-phase-1-complete.md](../process/cpm-phase-1-complete.md), [cpm-phase-4-complete.md](../process/cpm-phase-4-complete.md).
