# Chevron brand assets

## App icon

Source of truth for packaged icons:

```text
resources/app-icons/<channel>/
  chevron.icns / chevron.ico / chevron.png   # packager basenames (mac / win / linux)
  atom.icns / atom.ico / atom.png            # compatibility copies of the same art
  png/16.png … 1024.png / atom.png           # freedesktop sizes + legacy name
```

Channels: `stable`, `beta`, `nightly`, `dev` (tinted variants).

Packaging prefers the **`chevron`** basename (`package-application` icon path, Windows setup icon, `CFBundleIconFile`). Linux **requires** `chevron.png` next to that basename (`@electron/packager` does not read `png/1024.png` automatically).

## Mark

The mark is a **double chevron** (`>>`) on an indigo→cyan gradient rounded square — not the Atom orbital.

In-app SVG wordmarks live in:

- `packages/about/lib/components/chevron-logo.js`
- `packages/welcome/lib/welcome-view.js` (inline SVG)

## Regenerating icons

Multi-size PNGs / ICO come from the design **1024.png masters** (export with
transparent corners — see PR #21). Resize only:

```bash
python3 script/generate-app-icons.py   # requires Pillow; optional ImageMagick for .icns
```

Do **not** redraw the chevrons in code (jagged edges). Do **not** use
`chevron-icon-source.jpg` as master — it is RGB-only with white corners.

## Linux taskbar note

Wayland shells often ignore `BrowserWindow` icons and use the installed
`.desktop` + hicolor theme entry (`Icon=chevron`). Install via the package or
`script` install path so `StartupWMClass=Chevron` matches.

For a **local packaged build** (`out/Chevron-linux-x64`):

```bash
./script/install-local-linux-desktop.sh          # optional; not part of script/build
./script/install-local-linux-desktop.sh --uninstall
gtk-launch chevron   # prefer this over running the binary path directly
```
