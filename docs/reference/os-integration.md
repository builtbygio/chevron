# Desktop integration: Wayland, system theme, universal macOS bundle

**Implementation:** `src/main-process/ozone-platform.js`, `src/theme-variants.js`, `src/theme-manager.js`, `script/lib/make-mac-universal.js`

## Wayland (Linux)

Chevron passes `--ozone-platform-hint=auto` to Chromium, so on a Wayland session it runs as a native Wayland client rather than through XWayland (crisp fractional scaling, correct input on mixed-DPI setups). On an X11 session `auto` falls back to X11.

The default is only a default. Any of these wins over it:

| Override | Effect |
|----------|--------|
| `--ozone-platform=x11` / `--ozone-platform=wayland` | Force a backend |
| `--ozone-platform-hint=<auto\|x11\|wayland>` | Set the hint yourself |
| `ELECTRON_OZONE_PLATFORM_HINT=x11` | Same, from the environment. CI sets it so the smoke test runs under Xvfb |

The window's `app_id` on Wayland comes from `app.setDesktopName('chevron.desktop')`, so shells match the installed desktop entry and icon; `--class=Chevron` covers X11 (`start.js`).

Known Wayland limits (Chromium's, not Chevron's): a window cannot position itself, so the saved window position is not restored, and global keyboard shortcuts are unavailable.

## Follow the system theme

`core.followSystemTheme` (Settings › Core › **Follow System Theme**, default off). While on, the configured `core.themes` pick a *family* and the OS appearance picks the *variant*: with `['one-dark-ui', 'one-dark-syntax']` a light desktop gets One Light, a dark one One Dark. The swap is by name — `dark` ↔ `light` in the package name — and only when the counterpart is installed (`src/theme-variants.js`), so a theme without one is left alone.

The appearance is Electron's `nativeTheme.shouldUseDarkColors`, read in the main process:

| Channel | Direction | Payload |
|---------|-----------|---------|
| `chevron:native-theme-sync` / `chevron:native-theme` | renderer → main | `{ shouldUseDarkColors, shouldUseHighContrastColors, themeSource }` |
| `chevron:did-change-native-theme` | main → every window | `{ shouldUseDarkColors }` on `nativeTheme` `updated` |

`ThemeManager` re-reads it on that event and reloads the themes; reloads are serialised so an OS change and a config change arriving together cannot interleave. The Themes panel in Settings keeps showing the configured family.

## Universal macOS bundle

One `Chevron.app` runs on Intel and Apple Silicon. How the two per-arch builds are merged, and what the merge has to work around, is in [packaging.md](./packaging.md#macos-universal-bundle).
