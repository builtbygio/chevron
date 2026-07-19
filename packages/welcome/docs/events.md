# Welcome package events

Chevron does **not** ship a metrics / analytics pipeline. The welcome package
still has a small `ReporterProxy` so UI code can call `sendEvent` without
crashing.

## Behaviour today

- Events are **queued in memory** until a `metrics-reporter` service is
  consumed.
- Chevron does not provide that service by default, so events are **discarded**
  when the package deactivates or the process exits.
- `core.telemetryConsent` is forced to `no` on activate; there is no consent UI.

## Event shape (if a reporter is ever attached)

- **eventType / category:** `welcome-v1`
- **fields:** `ea` (action), optional `el` (label), optional `ev` (value)

Examples of actions that may be emitted:

| `ea` | When |
|------|------|
| `show-on-initial-load` | Welcome panes opened because `welcome.showOnStartup` is true |
| `expand-*-section` / `collapse-*-section` | Guide accordion toggled |
| `clicked-*-cta` | Guide primary buttons |
| `clicked-welcome-*-link` | Welcome footer / help links |

This document is for developers only. It is **not** a commitment to collect
product analytics.
