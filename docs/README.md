# Chevron documentation

Chevron is a modernized fork of Atom. This tree holds **project-specific** design and ops docs. Historical Atom user docs live in the [Flight Manual](https://flight-manual.atom.io) / archive.

## Package manager (cpm)

| Doc | Purpose |
|-----|---------|
| [cpm-cutover.md](./cpm-cutover.md) | **Start here** — user/author/packager migration notes |
| [cpm-design.md](./cpm-design.md) | Authoritative design (Phases 0–4 complete) |
| [cpm-design-eli5.md](./cpm-design-eli5.md) | Plain-language companion |
| [cpm-prebuilds.md](./cpm-prebuilds.md) | Native prebuild guidance for package authors |
| [cpm-phase-1-complete.md](./cpm-phase-1-complete.md) | Phase 1 closeout |
| [cpm-phase-4-complete.md](./cpm-phase-4-complete.md) | Phase 4 closeout |
| [cpm-phase-0-inventory.md](./cpm-phase-0-inventory.md) | Historical Phase 0 inventory |
| [cpm-phase-0-spike.md](./cpm-phase-0-spike.md) | Historical Phase 0 spike |

CLI source and README: [`cpm/`](../cpm/).

## Build from source

- [build-instructions/linux.md](./build-instructions/linux.md)
- [build-instructions/macOS.md](./build-instructions/macOS.md)
- [build-instructions/windows.md](./build-instructions/windows.md)
- [build-instructions/build-status.md](./build-instructions/build-status.md)

Always use `./script/bootstrap-modern` (host Node 24 + host npm). See root [README.md](../README.md).

## Product / architecture

| Doc | Purpose |
|-----|---------|
| [REBRANDING.md](./REBRANDING.md) | Chevron dual-support decisions |
| [onboarding-polish.md](./onboarding-polish.md) | First-run Welcome/Guide checklist |
| [atom-architecture.md](./atom-architecture.md) | Architecture notes |
| [atom-architecture-eli5.md](./atom-architecture-eli5.md) | ELI5 architecture |
| [CHANGELOG.md](../CHANGELOG.md) | Release notes |

## Security

| Doc | Purpose |
|-----|---------|
| [security-threat-model.md](./security-threat-model.md) | Trust tiers + residual risk |
| [security-phase-s.md](./security-phase-s.md) | Phase S — **complete** (Option C) |
| [security-phase-s-decision.md](./security-phase-s-decision.md) | **S5/S6** product decision: editor sandbox false |
| [security-phase-s-package-host.md](./security-phase-s-package-host.md) | **S1.2** package host design (Option B/C) |
| [security-phase-s-utilityprocess.md](./security-phase-s-utilityprocess.md) | **S3** github workers → utilityProcess |
| [babel-coffee-isolation-plan.md](./babel-coffee-isolation-plan.md) | Coffee dropped (Option 2); Babel-5 isolate via `CHEVRON_DISABLE_LEGACY_TRANSPILE` |
| [nested-package-modules.md](./nested-package-modules.md) | Nested `packages/*/node_modules` policy |
| [electron-best-practices-plan.md](./electron-best-practices-plan.md) | BP P0–P3 (closed at 0.6.0) |
| [security-phase-n.md](./security-phase-n.md) | Phase N plan (package Node surface) |
| [security-phase-n2.md](./security-phase-n2.md) | N2 package shell / fs IPC |
| [security-phase-n3.md](./security-phase-n3.md) | N3 preload privilege + guests |
| [security-phase-n4.md](./security-phase-n4.md) | N4 guest WebContents polish |
| [security-phase-n5.md](./security-phase-n5.md) | N5 secondary windows; Phase S path (hackable-compatible) |
| [package-node-policy.md](./package-node-policy.md) | Package author Node policy |
| [package-ownership-inventory.md](./package-ownership-inventory.md) | Owned vs `atom/*` pins + fork queue |
| [sca-runtime-inventory.md](./sca-runtime-inventory.md) | npm audit prioritisation (runtime vs test) |
| [remote-ipc-inventory.md](./remote-ipc-inventory.md) | Historical remote/IPC map |

## Other

- [contributing.md](./contributing.md), [contributing-to-packages.md](./contributing-to-packages.md)
- [native-profiling.md](./native-profiling.md)
- RFCs under `rfcs/`, toolchain upgrade plan
