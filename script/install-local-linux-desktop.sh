#!/usr/bin/env bash
# Optional user-level .desktop + hicolor icons for a local packaged build.
# Not run by script/build. Debian/RPM installers ship their own entries.
#
# Usage (from repo root, after build):
#   ./script/install-local-linux-desktop.sh
#   ./script/install-local-linux-desktop.sh /path/to/Chevron-linux-x64
#   ./script/install-local-linux-desktop.sh --uninstall
set -euo pipefail

if [[ "${1:-}" == "--uninstall" || "${1:-}" == "uninstall" ]]; then
  DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
  HICOLOR="$DATA_HOME/icons/hicolor"
  APPS="$DATA_HOME/applications"
  echo "Removing user-level Chevron desktop entries and icons"
  rm -f "$APPS/chevron.desktop" "$APPS/Chevron.desktop"
  for size in 16 24 32 48 64 128 256 512 1024; do
    rm -f "$HICOLOR/${size}x${size}/apps/chevron.png"
  done
  if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HICOLOR" 2>/dev/null || true
  fi
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$APPS" 2>/dev/null || true
  fi
  echo "Removed."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGED="${1:-$REPO_ROOT/out/Chevron-linux-x64}"
APP="$PACKAGED/chevron"
CHANNEL_PNG="$REPO_ROOT/resources/app-icons/stable/png"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
HICOLOR="$DATA_HOME/icons/hicolor"
APPS="$DATA_HOME/applications"
ICON_NAME=chevron

if [[ ! -x "$APP" ]]; then
  echo "error: packaged binary not found or not executable: $APP" >&2
  echo "Build first: ./script/with-modern-env ./script/build --no-bootstrap" >&2
  exit 1
fi
if [[ ! -d "$CHANNEL_PNG" ]]; then
  echo "error: missing icon sources at $CHANNEL_PNG" >&2
  exit 1
fi

echo "Installing hicolor icons → $HICOLOR"
for size in 16 24 32 48 64 128 256 512 1024; do
  src="$CHANNEL_PNG/${size}.png"
  if [[ -f "$src" ]]; then
    dest="$HICOLOR/${size}x${size}/apps/${ICON_NAME}.png"
    mkdir -p "$(dirname "$dest")"
    cp -f "$src" "$dest"
  fi
done

ABS_ICON="$HICOLOR/256x256/apps/${ICON_NAME}.png"
mkdir -p "$APPS"

# Primary id matches app.setDesktopName('chevron.desktop') / product basename.
# Secondary capitalised id covers shells that key off productName "Chevron".
for id in chevron Chevron; do
  desktop="$APPS/${id}.desktop"
  cat >"$desktop" <<EOF
[Desktop Entry]
Name=Chevron
Comment=A hackable text editor for the 21st Century (Chevron)
GenericName=Text Editor
Exec=env ATOM_DISABLE_SHELLING_OUT_FOR_ENVIRONMENT=false ${APP} %F
Icon=${ABS_ICON}
Type=Application
StartupNotify=true
Terminal=false
Categories=GTK;Utility;TextEditor;Development;
MimeType=text/plain;inode/directory;
StartupWMClass=${id}
EOF
  chmod 644 "$desktop"
  echo "Wrote $desktop"
done

# Copy into package tree for reference
cp -f "$APPS/chevron.desktop" "$PACKAGED/chevron.desktop" 2>/dev/null || true

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$HICOLOR" 2>/dev/null || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS" 2>/dev/null || true
fi
if command -v xdg-desktop-menu >/dev/null 2>&1; then
  xdg-desktop-menu forceupdate 2>/dev/null || true
fi

echo
echo "Installed. Launch with:"
echo "  gtk-launch chevron"
echo "  # or open Chevron from the app grid (not the raw binary path)"
echo "Direct binary launches on Wayland often keep the generic icon."
