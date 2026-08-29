# Chevron documentation

Chevron is a modernized fork of Atom. This tree holds **project-specific** design and ops docs.
Historical Atom Flight Manual / atom.io pages are unmaintained — start here, not there.

Docs are organised by **what they are for**, because the four kinds have very different
lifetimes and a reader needs to know which one they are holding:

| Section | Question it answers | If it goes stale |
|---------|--------------------|------------------|
| [orientation/](./orientation/) | *What is this and how do I work on it?* | newcomers get lost |
| [reference/](./reference/) | *How does the system work **now**?* | **people act on it and break things** |
| [decisions/](./decisions/) | *Why is it this way?* | settled questions get re-litigated or quietly undone |
| [process/](./process/) | *How did finished work get done?* | mostly harmless — it is history |

`reference/` is the section that must stay true. `process/` is closed by definition — do not read
it as current state.

---

## orientation — start here

| Doc | Purpose |
|-----|---------|
| [atom-architecture-eli5.md](./orientation/atom-architecture-eli5.md) | The big picture, no jargon |
| [build-instructions/linux.md](./orientation/build-instructions/linux.md) · [macOS.md](./orientation/build-instructions/macOS.md) · [windows.md](./orientation/build-instructions/windows.md) | Build from source |
| [build-instructions/build-status.md](./orientation/build-instructions/build-status.md) | Per-platform build/CI status |
| [cpm-cutover.md](./orientation/cpm-cutover.md) | **cpm start here** — user / author / packager migration |
| [cpm-design-eli5.md](./orientation/cpm-design-eli5.md) | cpm in plain language |
| [cpm-prebuilds.md](./orientation/cpm-prebuilds.md) | Native prebuilds for package authors |
| [contributing-to-packages.md](./orientation/contributing-to-packages.md) | Working on a bundled package |
| [owned-package-modernization-checklist.md](./orientation/owned-package-modernization-checklist.md) | Per-package ownership → modernize checklist |
| [contributing.md](./contributing.md) | → root `CONTRIBUTING.md` |

Always use `./script/bootstrap-modern` (host Node 24 + Python 3.12). See root [README.md](../README.md).

## reference — current state

**This is the section that must be true.** If you change behaviour, change these.

| Doc | Purpose |
|-----|---------|
| [chevron-architecture-modernization.md](./reference/chevron-architecture-modernization.md) | **Architecture target** + leftover table (authoritative) |
| [atom-architecture.md](./reference/atom-architecture.md) | Current-state sketch; defers to the target |
| [cpm-design.md](./reference/cpm-design.md) | cpm design, implemented |
| [lsp-design.md](./reference/lsp-design.md) | LSP host, implemented (phases 0–5) |
| [lsp-server-distribution.md](./reference/lsp-server-distribution.md) | Optional `chevron-lsp-*` server install |
| [language-stack.md](./reference/language-stack.md) | Tree-sitter coverage, TextMate exception list, **pin CSON inventory** (gates `season`) |
| [security-threat-model.md](./reference/security-threat-model.md) | Trust tiers + residual risk |
| [security-phase-s-package-host.md](./reference/security-phase-s-package-host.md) | Package host v2 spine (routing default off) |
| [package-node-policy.md](./reference/package-node-policy.md) | What package authors may use |
| [package-ownership-inventory.md](./reference/package-ownership-inventory.md) | Owned catalog |
| [sca-runtime-inventory.md](./reference/sca-runtime-inventory.md) | npm audit prioritisation (runtime vs test) |
| [remote-ipc-inventory.md](./reference/remote-ipc-inventory.md) | remote/IPC map; **§11 is the live `sendSync` inventory** |
| [releases.md](./reference/releases.md) | 1.1.0 product contract, update URL, signing later |
| [packaging.md](./reference/packaging.md) | Packaging + startup snapshot |
| [startup-snapshot-plan.md](./reference/startup-snapshot-plan.md) | Snapshot: Linux/Windows on, Darwin stock frozen |
| [build-modernization.md](./reference/build-modernization.md) | Bootstrap/build streams |
| [bootstrap-report.md](./reference/bootstrap-report.md) | Bootstrap current state |
| [bootstrap-patch-matrix.md](./reference/bootstrap-patch-matrix.md) | Patch matrix for Electron/Node/native pin changes |
| [dependency-graph.md](./reference/dependency-graph.md) | Install topology |
| [jasmine-ci.md](./reference/jasmine-ci.md) | Jasmine suite: nightly measurement, not a merge gate |

## decisions — why it is this way

Read before proposing to undo any of it. Some of these are also enforced as tests, which is
stronger than prose: `script/ci/wave3-gates.test.js` records why `season` and
`document-register-element` survive, and it fails rather than rotting.

| Doc | Decision |
|-----|----------|
| [REBRANDING.md](./decisions/REBRANDING.md) | Chevron-only product identity; Atom surfaces are unsupported |
| [package-ecosystem-strategy.md](./decisions/package-ecosystem-strategy.md) | Owned catalog only; community packages cancelled (locked) |
| [build-architecture.md](./decisions/build-architecture.md) | Compiled build, signed package artifacts, first-party registry (proposed) |
| [security-phase-s-decision.md](./decisions/security-phase-s-decision.md) | **Option C** — editor `sandbox: false` on purpose |
| [nested-package-modules.md](./decisions/nested-package-modules.md) | Nested `packages/*/node_modules` policy |
| [windows-userdata-migrate.md](./decisions/windows-userdata-migrate.md) | Resolved — no migration built, and why |
| [inherited/rfcs/](./decisions/inherited/rfcs/) | **Atom-era RFCs**, deliberately unedited. Not Chevron specs — kept as *provenance*: RFC 003 is why core packages are bundled the way they are, cited by `packages/README.md` |

## process — closed, kept for the "why"

Finished work. **Not** current-state references. Kept where they explain a constraint; git history
holds the rest.

| Doc | Outcome |
|-----|---------|
| [electron-best-practices-plan.md](./process/electron-best-practices-plan.md) | P0–P3, closed at 0.6.0 |
| [security-phase-n.md](./process/security-phase-n.md) · [n2](./process/security-phase-n2.md) · [n3](./process/security-phase-n3.md) · [n4](./process/security-phase-n4.md) · [n5](./process/security-phase-n5.md) | Phase N, complete |
| [security-phase-s.md](./process/security-phase-s.md) | Phase S, complete (Option C) |
| [security-phase-s-utilityprocess.md](./process/security-phase-s-utilityprocess.md) | S3 github workers → utilityProcess |
| [cpm-phase-0-inventory.md](./process/cpm-phase-0-inventory.md) · [spike](./process/cpm-phase-0-spike.md) · [phase 1](./process/cpm-phase-1-complete.md) · [phase 4](./process/cpm-phase-4-complete.md) | cpm closeouts |
| [atom-to-chevron-rename-plan.md](./process/atom-to-chevron-rename-plan.md) | Rename program |
| [babel-coffee-isolation-plan.md](./process/babel-coffee-isolation-plan.md) | Coffee + Babel 5 runtime dropped |
| [toolchain-node-python-upgrade-plan.md](./process/toolchain-node-python-upgrade-plan.md) | T1–T4 complete |
| [onboarding-polish.md](./process/onboarding-polish.md) | First-run polish tracks |
| [dogfood-1.0.md](./process/dogfood-1.0.md) | 1.0 dogfood week |
| [modernization/](./process/modernization/) | Early audit + transition plans. **Superseded** — `dependency-audit.md` still describes git SHA pins; the catalog has none |

## Post-1.1.0 modernization waves

Waves 1–4 are complete. Plan and leftover table:
[chevron-architecture-modernization.md](./reference/chevron-architecture-modernization.md); per-wave
outcome in root `GROK.md`. The waves removed `Task`, the `atom://` scheme and `.atom` host, dead
Relay + `graphql@14` in `github`, and the `natural` log4js patch.

`season` and `document-register-element` **stay** — see `script/ci/wave3-gates.test.js`.

