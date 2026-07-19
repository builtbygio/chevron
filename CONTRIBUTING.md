# Contributing to Chevron

Chevron is currently a solo project, but contributions, issues, and ideas are genuinely welcome. This doc explains how the project is run so anyone jumping in knows what to expect.

## Before you start

Chevron is in **active, early-stage architectural work** — specifically the `contextIsolation` / IPC migration described in the README. This isn't a "add a feature" phase yet; it's a "get the foundation onto a supported Electron version" phase. Before opening a PR for something non-trivial, please open an issue first to discuss the approach. It'll save you from doing work that gets blocked by an in-progress architectural change elsewhere in the codebase.

Good first contributions while the migration is ongoing:

- Flagging additional `remote`-module or other deprecated-API usages you find in the codebase
- Documentation fixes and clarifications
- Build/tooling issues on your platform
- Small, isolated bug fixes that don't touch IPC or the main/renderer boundary

## Workflow

Chevron uses a **branch → PR → merge** workflow, no direct commits to `main`.

1. **Fork** the repo (or branch directly if you have write access)
2. **Branch** off `main` using a descriptive prefix:
   - `feature/...` for new functionality
   - `fix/...` for bug fixes
   - `refactor/...` for internal restructuring (common right now, given the migration)
   - `docs/...` for documentation-only changes
3. **Commit** in small, focused chunks with clear messages explaining *why*, not just *what*
4. **Push** your branch and **open a PR** against `main`
5. Expect discussion/review even on solo-adjacent projects — it's how the codebase stays coherent
6. PRs are typically merged with `--squash` to keep `main` history clean

## Code style

- Match the existing surrounding code style rather than introducing a new one, even if you'd personally do it differently
- For non-obvious or architecturally significant changes, leave a short inline comment explaining the reasoning (e.g. `// CHANGED: <reason>` or `// NOTE: <context>`), especially around IPC and process-boundary code — this is the part of the codebase most likely to confuse future contributors (including future-me)
- Keep PRs scoped to one logical change. Large sprawling PRs are hard to review and harder to revert if something breaks

## Reporting issues

When filing an issue, please include:

- Your OS and Electron version (if the build has one running)
- Steps to reproduce, for bugs
- Whether it relates to the `contextIsolation` migration specifically — that context helps a lot given the current focus

## Questions

If something about the project's direction, architecture, or current focus is unclear, open an issue with the `question` label rather than guessing — happy to explain the reasoning behind the current approach.

## License

By contributing, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
