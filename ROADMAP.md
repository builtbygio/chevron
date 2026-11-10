# Chevron Roadmap

Chevron is a modernised fork of [Atom](https://github.com/atom/atom), rebuilt on a current version of Electron. It ships today as an [unsigned Linux x64 AppImage preview](https://github.com/builtbygio/chevron/releases).

This page shows what is in progress and roughly in what order. Plans may change as the editor is used. Nothing here is a promise or a date, only what is planned.

The latest release is [v1.6.0](https://github.com/builtbygio/chevron/releases/tag/v1.6.0) (29 October 2026). Work already on `master` since then is listed first, then what comes next. Longer design notes live in [docs/](docs/README.md).

## On master, not yet released

These have landed since 1.6.0 and will ship in the next unsigned preview.

- **Everyday editor features** ([#532](https://github.com/builtbygio/chevron/pull/532)). LSP code actions with a gutter lightbulb, format on save (`lsp.formatOnSave`), bracket-pair colouring, saved workspaces (`.chevron-workspace`), local file history, and a first accessibility step (the editor is a multiline text box for assistive technology).
- **Security fixes** in the editor, the build, and the package manager ([#533](https://github.com/builtbygio/chevron/pull/533)).
- **Minimap, a Node.js debugger, SSH editing, and settings export** ([#534](https://github.com/builtbygio/chevron/pull/534)). The debugger runs the current JavaScript file only; it is not a Debug Adapter Protocol client. SSH editing reads and saves a single path of the form `user@host:/absolute/path`, and can list a folder. Paths that contain spaces or shell characters are refused. Settings export writes a JSON bundle and leaves tokens and passwords out. It is not automatic sync.
- **Electron 45.2.2** and **React 19** in the GitHub package, plus other dependency updates (see [CHANGELOG.md](CHANGELOG.md)).

## Now

- **Finish the agent host.** The profiler, per-root config, diff review, a terminal, tasks, and project-wide symbols are in. A tool call now asks in the same modal shape as workspace trust, and the safe answer is deny. The session records what was read and why; **Agent: Show Context** opens that list ([agent-session.md](docs/reference/agent-session.md)). Still to build: an agent client that drives those prompts, and a per-command prompt on the agent-facing terminal. See [next-tracks-plan.md](docs/process/next-tracks-plan.md) track 3.

## Next

- **A Debug Adapter Protocol client.** [#532](https://github.com/builtbygio/chevron/pull/532) called this out as a separate product. [#534](https://github.com/builtbygio/chevron/pull/534) added a Node.js and JavaScript debugger only.
- **Automatic settings sync.** [#534](https://github.com/builtbygio/chevron/pull/534) already exports and imports a scrubbed JSON bundle. Sync that happens on its own is still to come.
- **A local model through Lowerbeam** (proposed). Chevron would own editor context, review, trust and the UI. [Lowerbeam](https://github.com/giobuilds/lowerbeam) would own the model and the agent loop. The first features, in this order, are selection actions (explain, refactor, write tests), fix from diagnostics, and then agent runs. The written plan is to start with a host-process spike, then the single-shot features, which need only Lowerbeam's existing Local API. Owner decisions in that document are still open, including whether to start now. See [ai-native-architecture.md](docs/decisions/ai-native-architecture.md).

## Later

- **Agent runs from the editor.** A run panel, a journal stream, multi-file review, and test evidence. This waits on a Lowerbeam runs API, which Lowerbeam does not ship today. See [ai-native-architecture.md](docs/decisions/ai-native-architecture.md) steps P5 and §10.
- **Signed release builds**, once the signing secrets are in place. The pipeline is already wired ([#398](https://github.com/builtbygio/chevron/pull/398), [auto-update.md](docs/reference/auto-update.md), [releases.md](docs/reference/releases.md)). Until then, unsigned Linux AppImages open the download page rather than installing a new build themselves.
- **Deeper remote editing, only if it becomes a priority.** [#534](https://github.com/builtbygio/chevron/pull/534) covers opening and saving one remote file. A virtual filesystem, a headless Chevron on the remote host, or remote language servers were costed and are still not planned. If the question returns, remote LSP is the cheapest useful step, and routing package file access through one abstraction would help even without remote support. The costing is in [next-tracks-plan.md](docs/process/next-tracks-plan.md) §4.

## Ideas

Worth doing, not yet scheduled.

- **Highlighting for the remaining scopes** that lost colour when the TextMate engine was removed (plain text, Sass, git buffers, `go.mod` / `go.sum`, and others). There is no maintained tree-sitter parser for these today. The list is in [language-stack.md](docs/reference/language-stack.md).
- **A further accessibility pass**, beyond the multiline text-box role added in [#532](https://github.com/builtbygio/chevron/pull/532).

## Out of Scope

- **Notebooks.** Not a Chevron feature.
- **Flathub or other store packages.** Distribution is the GitHub Release AppImage (and a direct download). Optional local Debian or RPM flags remain for people who build from source; CI no longer publishes those formats. See [releases.md](docs/reference/releases.md).
- **Community packages**, a public registry, or package host v2. Chevron ships an owned catalog only. That decision is locked: [package-ecosystem-strategy.md](docs/decisions/package-ecosystem-strategy.md).
- **A Pulsar rebase**, flipping the editor to `sandbox: true`, or rewriting the editor in Rust or Avalonia as the next step. Avalonia remains a long-horizon spike, and a rewrite would be reconsidered only if the tripwires in [ai-native-architecture.md](docs/decisions/ai-native-architecture.md) §8 are measured. See also the non-goals in [chevron-architecture-modernization.md](docs/reference/chevron-architecture-modernization.md).
- **Cloud model providers and inline completion.** The AI plan is local-first and names no cloud APIs. Inline completion is not in that plan.

## How to follow along

Releases and download notes: [docs/reference/releases.md](docs/reference/releases.md). Issues and pull requests: [github.com/builtbygio/chevron](https://github.com/builtbygio/chevron).
