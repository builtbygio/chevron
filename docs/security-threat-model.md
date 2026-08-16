# Chevron security threat model

**Status:** living doc (Electron BP complete as of 0.6.0; **Phase S Option C** as of close-out)  
**Related:** [electron-best-practices-plan.md](./electron-best-practices-plan.md) (closed), [security-phase-s-decision.md](./security-phase-s-decision.md), [package-node-policy.md](./package-node-policy.md), [security-phase-n.md](./security-phase-n.md)

## Goals

1. Protect the user’s machine and data from **malicious or compromised packages** and from **hostile web content** in previews/guests.
2. Keep a usable product: core editing, bundled packages, and git integration continue to work.
3. Prefer **default-secure** knobs; expert escape hatches stay available via env/config.

## Trust tiers

| Tier | Who | Privilege | Notes |
|------|-----|-----------|--------|
| **T0 Trusted** | Main process, core `src/`, `static/preload` boot | Full Node, shell, protocols | Attack surface minimized by IPC allowlists |
| **T1 Bundled** | Ship-in packages (github, tree-view, settings-view, …) | Preload Node today; prefer Atom APIs / IPC | Owned forks under `builtbygio/*` + in-repo `packages/*` |
| **T2 Community** | `~/.atom/packages`, `~/.chevron/packages` | **No privileged `require` by default** | `core.restrictCommunityPackageRequires` / `CHEVRON_RESTRICT_PACKAGE_REQUIRES` |
| **Untrusted** | Guest `<webview>` content, remote http(s) | No Node, sandboxed, scheme/path limits | N3/N4 + P2.4 file roots |

## Primary threats

| Threat | Mitigations |
|--------|-------------|
| Community package runs `child_process` / raw `fs` / `electron` | Default-on require restrict (P1.2); FS IPC roots (P2.1) |
| Community package loads arbitrary `.node` / keytar / superstring | Native addon + `.node` block (Phase S1.0) |
| Path traversal via `atom://` / `chevron://` | Path confinement (P0.1) |
| Renderer drives arbitrary `BrowserWindow` methods | Package-worker-only IPC allowlist (P0.2) |
| Cross-webContents message injection | Manager↔worker / self-only `atom-wc-send` (P0.3) |
| Guest opens `file:///etc/passwd` | Guest file: roots (P2.4) |
| `shell.openExternal('file://…')` | Scheme allowlist http/https/mailto |
| Invalid TLS accepted | `certificate-error` → deny (P3.4) |
| Tampered asar / NODE_OPTIONS | Electron fuses on package (P3.2) |

## Explicit non-goals (Phase S Option C)

- Editor Chromium `sandbox: true` — **declined** under Option C (hot-path natives in preload; see [security-phase-s-decision.md](./security-phase-s-decision.md))
- Zero Node for **bundled** packages (github **git workers** use utilityProcess; other T1 may still use preload Node)
- Full Atom package API compatibility for packages that require unrestricted Node

## Escape hatches (expert)

| Knob | Effect |
|------|--------|
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` | Allow community privileged requires |
| `core.restrictCommunityPackageRequires: false` | Same via config (main sets env at boot) |
| `CHEVRON_FS_IPC_STRICT=0` / `core.fsIpcStrict: false` | Allow FS IPC outside project/home/temp roots |
| `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` / `core.enableExperimentalWebFeatures` | Re-enable experimental Chromium features |
| `CHEVRON_FORCE_MKSNAPSHOT=1` | Retry custom V8 startup snapshot on Electron ≥43 |
| `CHEVRON_ALLOW_PACKAGE_WORKER_BROWSERWINDOW=1` | **Ignored.** Node BrowserWindow git workers were removed. |

## Residual risk

A **bundled** package bug or a user who disables restrict still yields full user-equivalent code execution in the editor preload. Treat package installs as software installs; prefer Pulsar/cpm sources you trust.
