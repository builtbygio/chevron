# Chevron security threat model

**Status:** living doc (Electron BP complete as of 0.6.0)  
**Related:** [electron-best-practices-plan.md](./electron-best-practices-plan.md) (closed), [package-node-policy.md](./package-node-policy.md), [security-phase-n.md](./security-phase-n.md)

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
| Path traversal via `atom://` / `chevron://` | Path confinement (P0.1) |
| Renderer drives arbitrary `BrowserWindow` methods | Package-worker-only IPC allowlist (P0.2) |
| Cross-webContents message injection | Manager↔worker / self-only `atom-wc-send` (P0.3) |
| Guest opens `file:///etc/passwd` | Guest file: roots (P2.4) |
| `shell.openExternal('file://…')` | Scheme allowlist http/https/mailto |
| Invalid TLS accepted | `certificate-error` → deny (P3.4) |
| Tampered asar / NODE_OPTIONS | Electron fuses on package (P3.2) |

## Explicit non-goals (until Phase S)

- Editor Chromium `sandbox: true` (blocked on natives — `src/preload-natives.js`)
- Zero Node for **bundled** packages (github workers still Node BrowserWindows until utilityProcess migration — P3.1 deferred)
- Full Atom package API compatibility for packages that require unrestricted Node

## Escape hatches (expert)

| Knob | Effect |
|------|--------|
| `CHEVRON_RESTRICT_PACKAGE_REQUIRES=0` | Allow community privileged requires |
| `core.restrictCommunityPackageRequires: false` | Same via config (main sets env at boot) |
| `CHEVRON_FS_IPC_STRICT=0` / `core.fsIpcStrict: false` | Allow FS IPC outside project/home/temp roots |
| `CHEVRON_EXPERIMENTAL_WEB_FEATURES=1` / `core.enableExperimentalWebFeatures` | Re-enable experimental Chromium features |
| `CHEVRON_FORCE_MKSNAPSHOT=1` | Retry custom V8 startup snapshot on Electron ≥43 |

## Residual risk

A **bundled** package bug or a user who disables restrict still yields full user-equivalent code execution in the editor preload. Treat package installs as software installs; prefer Pulsar/cpm sources you trust.
