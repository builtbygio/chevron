# First-run / onboarding polish

**Tracks:** README goal *Further first-run / onboarding polish*  
**Primary package:** `packages/welcome`  
**Related:** [REBRANDING.md](./REBRANDING.md), [CHANGELOG.md](../CHANGELOG.md)

Use this file as a progress checklist. Check items when done; add notes under **Log** at the bottom.

---

## Definition of done (README box)

All of the following should be true before checking the README goal:

- [x] No first-run path still *looks* like stock Atom sunset or Atom metrics consent without Chevron framing
- [x] Welcome Guide CTAs match **what actually works** on Chevron today (or are clearly labeled limited/WIP)
- [x] `docs/REBRANDING.md` open item **Optional first-run config migrate prompt** is done **or** explicitly WONTFIX with a one-line reason here
- [x] Welcome-related tests match the real first-run flow
- [x] Short note in CHANGELOG under Unreleased / next version

---

## Already done (0.3.0 baseline)

| Item | Where |
|------|--------|
| Chevron Welcome wordmark + tagline | `packages/welcome/lib/welcome-view.js` |
| Guide title / product name | `packages/welcome/lib/guide-view.js` |
| Startup: Welcome + Guide tabs | `packages/welcome/lib/welcome-package.js` |
| Telemetry forced off | same (`core.telemetryConsent` → `no`) |
| About + app icons brand mark | about package + `resources/app-icons/` |

---

## Workstream 1 — Dead / misleading surfaces

| ID | Task | Status | Notes |
|----|------|--------|-------|
| W1.1 | **sunsetting** view | [x] | **Deleted** (`sunsetting-view.js`, URI, deserializer, `showSunsettingOnStartup`) |
| W1.2 | **consent** view | [x] | **Deleted** (`consent-view.js`, URI, deserializer). Telemetry still forced off on activate |
| W1.3 | Welcome tests | [x] | Force-off, no consent/sunset panes, showOnStartup true/false, guide deserialize, no teletype section |
| W1.4 | Menus / docs / events | [x] | Help menu unchanged (Welcome Guide only); `docs/events.md` rewritten as no-metrics |

**Outcome:** zero user-facing path to Atom sunset/metrics consent UI.

---

## Workstream 2 — Guide honesty

| ID | Task | Status | Notes |
|----|------|--------|-------|
| W2.1 | Teletype card | [x] | **Removed** |
| W2.2 | Install a Package | [x] | Honest apm/registry limits note; **Open Installer** kept |
| W2.3 | Git / GitHub | [x] | CTAs unchanged (`github:toggle-*-tab`); copy slightly toned |
| W2.4 | Init / stylesheet / snippets | [x] | Config-home note (`~/.atom` / CHEVRON_HOME) |
| W2.5 | Help links | [x] | Primary → builtbygio/chevron |

---

## Workstream 3 — Dual-home first-run

| ID | Task | Status | Notes |
|----|------|--------|-------|
| W3.1 | Design choice | [x] | Silent dual-support default (`src/atom-paths.js`) |
| W3.2 | Migrate / choose-home UI | [x] | **Cancelled** |
| W3.3 | WONTFIX | [x] | No prompt: resolution already correct; prompt adds migration risk without demand. Revisit if `~/.chevron` adoption needs a nudge |

---

## Workstream 4 — Product onboarding

| ID | Task | Status | Notes |
|----|------|--------|-------|
| W4.1 | Two-tab sequencing | [x] | Welcome explains Guide; checkbox says both panes; Focus Welcome Guide button |
| W4.2 | Works / WIP panel | [x] | On Welcome tab |
| W4.3 | Empty-state / no project | [x] | Open a Project CTA on Welcome + Guide (no tree-view rewrite) |
| W4.4 | Shell command nudge | [x] | macOS/Linux: Install Shell Commands → `window:install-shell-commands` |
| W4.5 | Startup defaults | [x] | Keep show every window until user unchecks; documented on checkbox |

---

## Workstream 5 — Cleanup

| ID | Task | Status | Notes |
|----|------|--------|-------|
| W5.1 | Reporter / events docs | [x] | Keep `ReporterProxy` no-op queue; `docs/events.md` honest |
| W5.2 | Dead code | [x] | Consent/sunsetting files and config removed |

---

## Out of scope

| Topic | Where |
|-------|--------|
| cpm / apm successor | [cpm-design.md](./cpm-design.md) |
| Runtime package sandbox | Later platform work |
| Config-home migrate UI | W3 WONTFIX |

---

## Key files

```text
packages/welcome/lib/welcome-package.js
packages/welcome/lib/welcome-view.js
packages/welcome/lib/guide-view.js
packages/welcome/test/welcome.test.js
packages/welcome/docs/events.md
docs/REBRANDING.md
README.md
CHANGELOG.md
```

---

## Log

| Date | Note |
|------|------|
| 2026-07-19 | Checklist created from post-0.3.0 gap analysis. |
| 2026-07-19 | W1–W5 completed: delete sunset/consent; Guide honesty; W3 WONTFIX; Welcome works/WIP + shell nudge; docs/README/CHANGELOG. |
