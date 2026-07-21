# cpm Phase 1 — complete

**Date:** 2026-07-21  
**Status:** Done (PRs #25, #26, + finish PR)

## Delivered

| Area | Evidence |
|------|----------|
| CLI | `cpm/` — install, uninstall, list, link, rebuild, doctor |
| Process model | Launchers prefer `ELECTRON_RUN_AS_NODE` + product binary |
| Install | pacote + arborist; scripts off; path/git/registry smoke |
| Rebuild contract | `rebuild --no-color` → `{code,stdout,stderr}` tests |
| Dual home | `CHEVRON_HOME` / `ATOM_HOME` / `~/.chevron` / `~/.atom` |
| Product wire | `getApmPath` prefers cpm; package-application; Squirrel; shell; win resources |
| compile-cache | Policy **(b)** runtime-only |
| npm --prefix fallback | **Struck** — not in code |

## How to use

```bash
./cpm/bin/cpm doctor
./cpm/bin/cpm install ./cpm/test/fixtures/pure-js-package
./cpm/bin/cpm list
./cpm/bin/apm rebuild --no-color   # shim → cpm (editor contract)
```

## Next

- **Phase 2** — registry `search` / `view` / install-by-name  
- **Phase 3** — prebuilds  
- **Phase 4** — remove classic apm bundle from product  

See [cpm-design.md](./cpm-design.md) §10.
