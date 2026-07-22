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
| [security-phase-n.md](./security-phase-n.md) | Phase N plan (package Node surface) |
| [security-phase-n2.md](./security-phase-n2.md) | N2 package shell / fs IPC |
| [security-phase-n3.md](./security-phase-n3.md) | N3 preload privilege + guests |
| [package-node-policy.md](./package-node-policy.md) | Package author Node policy |
| [remote-ipc-inventory.md](./remote-ipc-inventory.md) | Historical remote/IPC map |

## Other

- [contributing.md](./contributing.md), [contributing-to-packages.md](./contributing-to-packages.md)
- [native-profiling.md](./native-profiling.md)
- RFCs under `rfcs/`, toolchain upgrade plan
