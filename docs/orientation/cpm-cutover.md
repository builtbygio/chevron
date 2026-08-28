# cpm cutover notes (apm → cpm)

**Audience:** Chevron users, packagers, and package authors  
**Status:** Roadmap Phases 0–4 **complete** (merged to `master`, 2026-07)  
**Design:** [cpm-design.md](../reference/cpm-design.md) · **Prebuilds:** [cpm-prebuilds.md](./cpm-prebuilds.md)

This is the user-facing cutover guide for the package-manager transition.

---

## What changed

| Area | Before | After |
|------|--------|--------|
| User / Settings install | Classic **apm** (bundled Node 12) | **cpm** (Electron-as-Node on product binary) |
| Command name `apm` | Real apm binary | **Retired** — nothing installs an `apm` name. Use `cpm` |
| Command name `cpm` | n/a | Primary package manager on PATH |
| App bootstrap (from source) | apm installed root `node_modules` | **Host npm** + modern Electron rebuild |
| Product package contents | `app/apm` = atom-package-manager | **`app/cpm` only** (+ tiny legacy path stubs) |
| Registry search | Dead atom.io | **Pulsar package API** by default (`CPM_REGISTRY_URL`) |
| Native modules | Fragile Node 12 rebuilds | Prefer **prebuilds**, then `@electron/rebuild` |

Product policy is **Chevron-only** (`global.chevron`, `engines.chevron`, `~/.chevron`). `global.atom` / `engines.atom` / the **`apm` name** are leftover shims, not a dual-support product goal.

---

## For users

### Install / uninstall packages

```bash
cpm search linter
cpm view linter
cpm install linter
cpm install git+https://github.com/atom/language-toml.git#master
cpm install ./path/to/local-package
cpm list
cpm uninstall linter
```

Compatibility:

```bash
apm install linter   # same as cpm install linter
apm rebuild --no-color   # editor rebuild contract still uses this shape
```

### Environment

| Variable | Role |
|----------|------|
| `CHEVRON_HOME` / `ATOM_HOME` | Package home (dual-support resolution) |
| `CPM_REGISTRY_URL` | Override registry API (default Pulsar) |

Packages still land under `…/packages` in the config home (`~/.atom` by default, or `~/.chevron` when present / configured).

### Settings UI

- **Search / featured / package metadata** hit the **Pulsar** registry (`https://api.pulsar-edit.dev/api/…`), not dead `atom.io` (bootstrap patches `settings-view`).
- **Install / uninstall / rebuild** spawn **`getApmPath()`** → **cpm** (or its `apm` shim).
- Browse the same corpus at [packages.pulsar-edit.dev](https://packages.pulsar-edit.dev).

---

## For package authors

1. Keep declaring **`engines.atom`** (and optionally `engines.chevron`).
2. Prefer shipping **prebuilds** for native addons — see [cpm-prebuilds.md](./cpm-prebuilds.md) and `.github/workflows/cpm-prebuild-example.yml`.
3. Install scripts are off by default; natives are rebuilt by cpm when needed.
4. Test with:

   ```bash
   ./cpm/bin/cpm install .
   ./cpm/bin/cpm rebuild --no-color
   ```

---

## For people building Chevron from source

```bash
./script/bootstrap-modern          # host npm for app; installs cpm deps
./script/with-modern-env ./script/build --no-bootstrap
```

- **Do not** use stock `./script/bootstrap` for modern hosts.
- **`--with-apm`** is deprecated debug-only (installs historical `apm/` tree; **not** used by packaging or CI).
- Monorepo folder `apm/` is historical; product does not ship it.

---

## Packaging / distro

- Deb/rpm/install-from-source put **`cpm`** and **`apm`** (shim) on PATH.
- Linux RPM `%files` includes both binaries.
- Windows Squirrel installs `cpm` + `apm` shims into the app `bin` folder.

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `apm: command not found` after upgrade | Install shell commands, or use `cpm`; reinstall package |
| Native module load failure | `cpm rebuild` in the package dir; prefer prebuilds |
| Registry empty / HTTP errors | Network; try `CPM_REGISTRY_URL`; install via git/path |
| Old scripts spawn absolute path to classic apm | Point at product `…/resources/app/cpm/bin/apm` or use PATH |

Doctor:

```bash
cpm doctor
```

---

## Phase map (complete)

| Phase | Outcome | PR(s) |
|-------|---------|-------|
| 0 | Bootstrap off apm → host npm | #24 |
| 1 | cpm CLI + product wiring | #25, #26, #27 |
| 2 | Registry search / view / install-by-name | #28 |
| 3 | Prebuilds before source rebuild | #29 |
| 4 | Classic apm retired from product | #30 |

See also: [cpm-phase-1-complete.md](../process/cpm-phase-1-complete.md), [cpm-phase-4-complete.md](../process/cpm-phase-4-complete.md).
