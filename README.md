# Chevron

A modernized fork of [Atom](https://github.com/atom/atom), the hackable text editor — resurrected and rebuilt on a current version of Electron.

> Named after the Stargate dialing mechanism: each chevron locks in a step toward a working connection. Fitting for a project that's rebuilding Atom's internals one architectural piece at a time.

## Why

Atom was officially [sunset by GitHub in December 2022](https://github.blog/2022-06-08-sunsetting-atom/) and hasn't received updates since. It shipped on Electron 11, which is years out of date, unsupported, and increasingly incompatible with modern Node.js, V8, and OS-level APIs.

Rather than a from-scratch rewrite, Chevron takes the harder — and more educational — path: bring Atom's existing codebase forward through modern Electron versions, one breaking change at a time.

## Status

🚧 **Active development, pre-alpha.** Not yet usable as a daily-driver editor.

Currently tackling: **`contextIsolation` migration.**

Electron enabled `contextIsolation` by default starting in Electron 12, and deprecated direct `remote` module access shortly after. Atom's original architecture (Electron 11) relies heavily on synchronous IPC and shared context between the main and renderer processes — patterns that modern Electron actively forbids for security reasons. Getting Chevron onto a supported Electron version means rearchitecting this IPC layer rather than just bumping a version number in `package.json`.

## Goals

- [ ] Migrate off deprecated `remote` module usage
- [ ] Rearchitect IPC to work under `contextIsolation: true`
- [ ] Get a clean build running on a current Electron LTS
- [ ] Re-audit and update Atom's package/plugin API surface for compatibility
- [ ] Strip or replace any other Electron-11-era APIs flagged as removed/deprecated
- [ ] (Longer term) Evaluate what a modern packaging/build pipeline should look like

## Non-goals (for now)

- A ground-up rewrite — this is a modernization effort, not a new editor
- Feature parity with VS Code or other modern editors
- Cross-platform polish before the core architecture is stable

## Background

Chevron is a solo learning project, developed in the open as part of a broader path toward systems programming and eventually building a custom OS and AI-integrated development platform. The Electron/IPC rearchitecture work here is deliberately treated as a real systems problem — understanding process boundaries, security models, and inter-process communication — rather than just a dependency bump.

## Development

Built using a branch → PR → merge workflow, even solo. Each PR is scoped to a phase of the migration (e.g. "Remove remote module from menu package," "Rearchitect settings-view IPC") so the PR history doubles as a changelog of the migration's progress.

```bash
git clone https://github.com/builtbygio/chevron.git
cd chevron
# build instructions TBD as the Electron migration stabilizes
```

## License

Atom was released under the MIT License. This fork retains that license — see [LICENSE](LICENSE).

## Acknowledgments

Built on the work of the original [Atom](https://github.com/atom/atom) team and community. [Pulsar](https://pulsar-edit.dev/) is the active community-maintained Atom fork focused on immediate usability — worth a look if you want a maintained daily driver today rather than a from-source modernization project.
