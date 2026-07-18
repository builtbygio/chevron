#!/usr/bin/env bash
# Force patched native packages for Electron 14+ (V8 ArrayBuffer API changes).
#
# Usage (from repo root):
#   . script/lib/force-patched-superstring.sh
#   chevron_force_patched_natives

# Ensure core utilities are always available (some env setups shrink PATH).
export PATH="/bin:/usr/bin:/usr/local/bin:/opt/homebrew/bin:${PATH:-}"

_chevron_ensure_nan_cache() {
  # Electron 43 / V8 13+ needs nan >= 2.22 (ScriptOrigin / External::Value APIs).
  # Keep this in sync with root package-lock nan.
  local nan_ver="2.28.0"
  # Prefer OS temp (Windows Git Bash: $TMPDIR or /tmp may differ).
  local cache="${TMPDIR:-/tmp}/chevron-nan-${nan_ver}"
  if [ ! -d "$cache/package" ]; then
    # Status on stderr so $(...) only captures the path.
    echo "Fetching nan@${nan_ver}..." >&2
    mkdir -p "$cache"
    (cd "$cache" && npm pack "nan@${nan_ver}" >/dev/null && tar xzf "nan-${nan_ver}.tgz")
  fi
  echo "$cache/package"
}

# After Electron rebuild of root natives, re-copy built trees into nested
# package dirs (text-buffer/node_modules/superstring, etc.). Nested copies
# made before rebuild lack build/Release/*.node and break packaged boots.
chevron_resync_nested_built_natives() {
  local repo_root="${1:-$(pwd)}"
  local npm_name base_name root_dest nested

  for npm_name in superstring tree-sitter keytar '@atom/watcher'; do
    root_dest="$repo_root/node_modules/$npm_name"
    if [ ! -d "$root_dest" ]; then
      continue
    fi
    base_name="$(basename "$npm_name")"
    local node_bin=""
    case "$npm_name" in
      superstring) node_bin="$root_dest/build/Release/superstring.node" ;;
      tree-sitter) node_bin="$root_dest/build/Release/tree_sitter_runtime_binding.node" ;;
      keytar) node_bin="$root_dest/build/Release/keytar.node" ;;
      '@atom/watcher') node_bin="$root_dest/build/Release/watcher.node" ;;
    esac
    if [ -n "$node_bin" ] && [ ! -f "$node_bin" ]; then
      echo "WARNING: $npm_name missing built binary at $node_bin — nested resync may still fail" >&2
    fi

    while IFS= read -r nested; do
      [ -z "$nested" ] && continue
      case "$nested" in
        */vendor/*|*/build/*) continue ;;
      esac
      [ -d "$nested" ] || continue
      nested="$(cd "$nested" 2>/dev/null && pwd)" || continue
      [ "$nested" = "$root_dest" ] && continue
      [ "$(basename "$nested")" = "$base_name" ] || continue
      if [[ "$npm_name" == @atom/* ]]; then
        [ "$(basename "$(dirname "$nested")")" = "@atom" ] || continue
      fi
      echo "Re-sync nested $npm_name (with .node) -> $nested"
      rm -rf "$nested"
      mkdir -p "$(dirname "$nested")"
      if command -v rsync >/dev/null 2>&1; then
        rsync -a "$root_dest/" "$nested/"
      else
        cp -R "$root_dest" "$nested"
      fi
    done < <(find "$repo_root/node_modules" -type d -name "$base_name" 2>/dev/null || true)
  done
  echo "Nested built natives re-synced from root."
}

chevron_force_one_native() {
  local repo_root="$1"
  local package_name="$2"
  local fork_rel="$3"
  local npm_name="$4"

  local fork="$repo_root/$fork_rel"
  local root_dest="$repo_root/node_modules/$npm_name"

  if [ ! -d "$fork" ]; then
    echo "error: missing patched package at $fork" >&2
    return 1
  fi

  mkdir -p "$(dirname "$root_dest")"
  rm -rf "$root_dest"
  echo "Installing patched $package_name -> node_modules/$npm_name"
  mkdir -p "$root_dest"
  # Prefer a real directory copy (not a symlink) so electron-packager with
  # derefSymlinks:false still ships the package into the asar tree.
  # Include build/ when present so rebuilt context-aware .node files package.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude node_modules --exclude package-lock.json \
      "$fork/" "$root_dest/"
  else
    tar -C "$fork" \
      --exclude=node_modules --exclude=package-lock.json \
      -cf - . | tar -C "$root_dest" -xf -
  fi

  if grep -q '"nan"' "$root_dest/package.json" 2>/dev/null; then
    local nan_src
    nan_src="$(_chevron_ensure_nan_cache)"
    mkdir -p "$root_dest/node_modules"
    rm -rf "$root_dest/node_modules/nan"
    cp -R "$nan_src" "$root_dest/node_modules/nan"
  fi

  # Collect nested package dirs (real dirs only; skip vendor/ and build/)
  local nested base_name
  base_name="$(basename "$npm_name")"
  local -a to_link=()
  while IFS= read -r nested; do
    [ -z "$nested" ] && continue
    case "$nested" in
      */vendor/*|*/build/*) continue ;;
    esac
    # Skip if not a real directory (broken symlinks etc.)
    [ -d "$nested" ] || continue
    # Resolve to absolute path without following final symlink if broken
    nested="$(cd "$nested" 2>/dev/null && pwd)" || continue
    [ "$nested" = "$root_dest" ] && continue
    [ "$(basename "$nested")" = "$base_name" ] || continue
    if [[ "$npm_name" == @atom/* ]]; then
      [ "$(basename "$(dirname "$nested")")" = "@atom" ] || continue
    fi
    to_link+=("$nested")
  done < <(find "$repo_root/node_modules" -type d -name "$base_name" 2>/dev/null || true)

  # Copy nested instances (not symlink): asar packaging rejects links that
  # point outside the app tree (e.g. text-buffer/node_modules/superstring).
  # NOTE: never name a variable `path` — in zsh it is tied to PATH.
  local link_target
  for link_target in "${to_link[@]+"${to_link[@]}"}"; do
    [ -n "$link_target" ] || continue
    echo "Copying nested $package_name -> $link_target"
    rm -rf "$link_target"
    mkdir -p "$(dirname "$link_target")"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$root_dest/" "$link_target/"
    else
      cp -R "$root_dest" "$link_target"
    fi
  done
}

chevron_upgrade_nan_for_electron14() {
  local repo_root="${1:-$(pwd)}"
  local nan_src
  nan_src="$(_chevron_ensure_nan_cache)"
  local upgraded=0
  local nan_dir ver needs_upgrade

  while IFS= read -r nan_dir; do
    [ -z "$nan_dir" ] && continue
    [ -d "$nan_dir" ] || continue
    ver=""
    if [ -f "$nan_dir/package.json" ]; then
      ver="$(node -p "try{require('$nan_dir/package.json').version}catch(e){''}" 2>/dev/null || true)"
    fi
    needs_upgrade=0
    if [ -z "$ver" ]; then
      needs_upgrade=1
    else
      needs_upgrade="$(node -e "
        const v=process.argv[1].split('.').map(Number);
        const min=[2,22,0];
        let lt=false;
        for (let i=0;i<3;i++){
          if ((v[i]||0)<min[i]){lt=true;break;}
          if ((v[i]||0)>min[i])break;
        }
        process.stdout.write(lt?'1':'0');
      " "$ver" 2>/dev/null || echo 0)"
    fi
    if [ "$needs_upgrade" = "1" ]; then
      echo "Upgrading nan ${ver:-unknown} -> 2.28.0 at $nan_dir"
      rm -rf "$nan_dir"
      mkdir -p "$(dirname "$nan_dir")"
      cp -R "$nan_src" "$nan_dir"
      upgraded=$((upgraded + 1))
    fi
  done < <(find "$repo_root/node_modules" -type d -path '*/node_modules/nan' 2>/dev/null || true)

  echo "nan upgrades applied: $upgraded"
}

chevron_force_patched_superstring() {
  chevron_force_patched_natives "$@"
}

chevron_force_patched_natives() {
  local repo_root="${1:-$(pwd)}"
  chevron_force_one_native "$repo_root" "superstring" "packages/superstring" "superstring" || return 1
  chevron_force_one_native "$repo_root" "@atom/watcher" "packages/watcher" "@atom/watcher" || return 1
  chevron_force_one_native "$repo_root" "tree-sitter" "packages/tree-sitter" "tree-sitter" || return 1

  # tree-sitter only needs nan + vendor/; drop accidental nested packages
  # (e.g. tree-sitter-javascript from a polluted npm install)
  if [ -d "$repo_root/node_modules/tree-sitter/node_modules" ]; then
    find "$repo_root/node_modules/tree-sitter/node_modules" -mindepth 1 -maxdepth 1 \
      ! -name nan -exec rm -rf {} + 2>/dev/null || true
  fi

  chevron_upgrade_nan_for_electron14 "$repo_root"

  if grep -R "GetContents()" "$repo_root/node_modules/superstring/src" --include='*.cc' 2>/dev/null | grep -v '//'; then
    echo "error: superstring still has GetContents() calls" >&2
    return 1
  fi
  # GetBackingStore() returns std::shared_ptr and does not link on Windows MSVC
  # against Electron's Chromium-libc++ node.lib (std::__Cr). Use Data() instead.
  if grep -R "GetBackingStore()" "$repo_root/node_modules/superstring/src" --include='*.cc' 2>/dev/null | grep -v '//'; then
    echo "error: superstring still has GetBackingStore() calls (use ArrayBuffer::Data())" >&2
    return 1
  fi
  echo "Patched native packages are in place."
}

# Back-compat aliases (AtomNova-era names).
atomnova_force_patched_superstring() { chevron_force_patched_superstring "$@"; }
atomnova_force_patched_natives() { chevron_force_patched_natives "$@"; }
atomnova_resync_nested_built_natives() { chevron_resync_nested_built_natives "$@"; }
