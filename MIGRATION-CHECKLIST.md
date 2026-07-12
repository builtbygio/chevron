# AtomNova Migration Checklist

**Project Goal**: Revive and modernize the Atom text editor as **AtomNova** — a fast, secure, and hackable editor for the 2020s.

This document tracks **Phase 1**: Bring the codebase up to date, secure, and buildable on modern systems.  
**Phase 2** (future) will cover new features, architecture improvements, and community growth.

## 1. Project Setup & Branding

- [ ] Fork the base repository (recommend starting from `atom/atom` archive or Pulsar/Atom-Community for existing patches).
- [ ] Rename project-wide:
  - Binary/executable: `atom` → `atomnova`
  - Package name: `atom` → `atomnova`
  - App ID, product name, and display name
  - Repository name and organization (if applicable)
- [ ] Update all branding assets:
  - App icon (create new variants for AtomNova)
  - Logos, splash screens, about dialog
  - Colors/themes (optional: introduce a fresh default theme)
- [ ] Update `package.json` (name, version, description, repository, bugs, homepage, etc.)
- [ ] Choose and update license if needed (original is MIT)
- [ ] Create initial `README.md` with AtomNova branding, quick start, and migration note
- [ ] Add `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md`

## 2. Core Dependencies & Build System

- [ ] Update **Electron** to latest stable (currently v30+ — check latest)
- [ ] Update **Node.js** version (`.nvmrc`, engines field, CI)
- [ ] Audit and update all npm dependencies (`npm outdated` + `npm audit`)
- [ ] Migrate or polyfill deprecated Electron APIs (context isolation, sandbox, remote module removal, etc.)
- [ ] Update build tools:
  - electron-builder / electron-packager
  - Webpack / other bundlers if used
- [ ] Replace CoffeeScript with modern JavaScript/TypeScript where practical (start with new files; gradual migration)
- [ ] Update any native modules / addons for compatibility

## 3. Security & Performance

- [ ] Enable Electron security best practices:
  - Context Isolation: `true`
  - Sandbox: `true` where possible
  - Disable `nodeIntegration` in renderers
  - Use `preload` scripts properly
- [x] Remove or disable any GitHub telemetry / tracking
- [ ] Implement or improve auto-updates (using electron-updater or similar)
- [ ] Review and harden package manager (apm equivalent)
- [ ] Optimize startup time and memory usage (profile with Electron tools)
- [ ] Update file watching (chokidar or native alternatives)

## 4. Package Ecosystem & Compatibility

- [ ] Ensure backward compatibility with existing Atom/Pulsar packages (test popular ones)
- [ ] Update or replace the package manager backend if needed
- [ ] Create a migration guide for users coming from Atom/Pulsar
- [ ] Set up a package repository (or use existing community ones initially)

## 5. Testing & CI/CD

- [ ] Set up GitHub Actions for:
  - Linux, macOS, Windows builds
  - Unit/integration tests
  - Linting (ESLint, etc.)
- [ ] Write or update automated tests
- [ ] Test on modern OS versions (Windows 11, macOS 15+, latest Linux distros)
- [ ] Manual testing checklist for core features (editing, git integration, tree view, command palette, themes, etc.)

## 6. Documentation & Release

- [ ] Update all internal documentation and help files
- [ ] Create release notes template
- [ ] Draft initial release (v1.0.0-alpha or similar)
- [ ] Set up website / landing page (optional but recommended)
- [ ] Publish first build artifacts

## 7. Post-Migration Validation

- [ ] Confirm the editor launches and basic editing works
- [ ] Verify major features (split panes, multi-cursor, find/replace, git, packages)
- [ ] Check performance vs original Atom
- [ ] Security audit (npm audit + manual review)
- [ ] Community feedback on initial alpha release

---

## Phase 2 Ideas (Backlog)

- Modern LSP support improvements
- Built-in AI assistance
- Performance optimizations (lighter Electron alternatives long-term?)
- Enhanced theming / UI refresh
- Better collaboration features
- Native-like feel on each platform
- ... (expand based on community input)

## Useful Resources

- Pulsar project (great reference for upgrades): <https://github.com/pulsar-edit/pulsar>
- Electron documentation & breaking changes
- Atom flight manual (legacy)

---

**Status**: Track progress by checking boxes and updating this file.  
**Target**: Stable modern base before announcing widely.

*Last Updated: [Insert Date]*
