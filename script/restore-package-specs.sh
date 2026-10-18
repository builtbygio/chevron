#!/usr/bin/env bash
#
# Restore vendored packages' spec/ directories from upstream.
#
# The packages were vendored from published npm tarballs, which exclude spec/
# via files/.npmignore, so the specs never arrived. See
# docs/process/test-runner-migration.md.
#
# Source of truth is atom/<pkg>: the builtbygio/<pkg> repositories named in the
# vendored manifests do not exist, and Chevron's fork versions are ahead of
# upstream's last release, so a v<vendored-version> tag never matches. This
# takes the highest upstream tag at or below the vendored version, and falls
# back to the default branch when that tag does not exist. A tag whose specs
# are entirely CoffeeScript falls back the same way, in case master already
# has the JavaScript rewrite.
#
# Usage:  script/restore-package-specs.sh [package ...]
#         script/restore-package-specs.sh --list
#
# Re-runnable: a package that already has spec/ is left alone.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is required (it authenticates; plain git clone has no credentials in CI)" >&2
  exit 1
fi

missing_packages() {
  node -e '
    const fs = require("fs");
    const now = require("./package.json");
    for (const p of Object.keys(now.packageDependencies).sort()) {
      if (["spec", "test"].some(d => fs.existsSync(`packages/${p}/${d}`))) continue;
      console.log(p);
    }'
}

vendored_version() {
  node -e '
    const fs = require("fs");
    const p = process.argv[1];
    try {
      console.log(JSON.parse(fs.readFileSync(`packages/${p}/package.json`)).version || "");
    } catch (_) { console.log(""); }' "$1"
}

# Highest tag at or below the vendored version. Compared numerically in
# script/lib/upstream-tag.js: a string compare treats 0.37.8 as newer than
# 0.37.10 and used to land on an older CoffeeScript tag.
best_tag() {
  local pkg="$1" version="$2"
  gh api "repos/atom/$pkg/tags?per_page=100" --jq '.[].name' 2>/dev/null |
    node script/lib/upstream-tag.js "$version"
}

# Download ref and copy its spec/ or test/ to packages/$pkg/spec.
# Drops .coffee. Sets FETCH_COFFEE and FETCH_JS.
# Returns 0 when JS specs remain, 2 when only CoffeeScript was there,
# 3 when the tarball could not be fetched, 4 when the ref has no spec/test.
materialize_specs() {
  local pkg="$1" ref="$2"
  local tmp extracted srcdir candidate
  FETCH_COFFEE=0
  FETCH_JS=0
  tmp="$(mktemp -d)"
  if ! gh api "repos/atom/$pkg/tarball/$ref" > "$tmp/src.tgz" 2>/dev/null; then
    rm -rf "$tmp"
    return 3
  fi
  tar -xzf "$tmp/src.tgz" -C "$tmp" 2>/dev/null || true
  extracted="$(find "$tmp" -maxdepth 1 -mindepth 1 -type d | head -1)"
  # Upstream packages use spec/ or test/ — command-palette uses test/, and
  # looking only for spec/ reported it as having none.
  srcdir=""
  for candidate in spec test; do
    if [ -n "$extracted" ] && [ -d "$extracted/$candidate" ]; then
      srcdir="$extracted/$candidate"
      break
    fi
  done
  if [ -z "$srcdir" ]; then
    rm -rf "$tmp"
    return 4
  fi

  # Only the tests. Never lib/ or package.json: the vendored copies are ours.
  rm -rf "packages/$pkg/spec"
  cp -R "$srcdir" "packages/$pkg/spec"
  rm -rf "$tmp"

  # CoffeeScript is not allowed in owned packages (PR 23), and the repo has a
  # gate for it. Upstream Atom specs are partly CoffeeScript, so drop those.
  FETCH_COFFEE="$(find "packages/$pkg/spec" -name '*.coffee' | wc -l | tr -d ' ')"
  FETCH_JS="$(find "packages/$pkg/spec" -name '*.js' | wc -l | tr -d ' ')"
  if [ "$FETCH_COFFEE" -gt 0 ]; then
    find "packages/$pkg/spec" -name '*.coffee' -delete
  fi
  if [ "$FETCH_JS" -eq 0 ]; then
    rm -rf "packages/$pkg/spec"
    return 2
  fi
  return 0
}

restore_one() {
  local pkg="$1"
  if [ -d "packages/$pkg/spec" ] || [ -d "packages/$pkg/test" ]; then
    printf '%-30s %s\n' "$pkg" "already present"
    return 0
  fi

  # No pipeline here on purpose: with pipefail, `gh | head -1` kills gh with
  # SIGPIPE and every repository reads as missing.
  if ! gh api "repos/atom/$pkg" --jq .id >/dev/null 2>&1; then
    printf '%-30s %s\n' "$pkg" "no upstream spec (no atom/$pkg)"
    return 0
  fi

  # A package that declares its own runner does not join the Jasmine nightly,
  # and atom-mocha-test-runner is itself an ES module this runner cannot load.
  local runner
  runner="$(node -e '
    const fs = require("fs");
    try {
      const j = JSON.parse(fs.readFileSync(`packages/${process.argv[1]}/package.json`));
      process.stdout.write(j.chevronTestRunner || j.atomTestRunner || "");
    } catch (_) { process.stdout.write(""); }
  ' "$pkg")"
  if [ -n "$runner" ]; then
    printf '%-30s %s\n' "$pkg" "skipped (declares testRunner: $runner)"
    return 0
  fi

  local version tag ref label status tag_coffee branch
  version="$(vendored_version "$pkg")"
  tag="$(best_tag "$pkg" "$version")"
  if [ -n "$tag" ]; then
    ref="v$tag"
    label="restored (atom v$tag)"
  else
    ref="$(gh api "repos/atom/$pkg" --jq .default_branch 2>/dev/null)"
    label="restored (atom default branch)"
  fi

  materialize_specs "$pkg" "$ref"
  status=$?
  # A tag can be entirely CoffeeScript while master already has the JS
  # rewrite. Try the default branch before reporting the package unusable.
  if [ "$status" -eq 2 ] && [ -n "$tag" ]; then
    tag_coffee="$FETCH_COFFEE"
    branch="$(gh api "repos/atom/$pkg" --jq .default_branch 2>/dev/null)"
    if [ -n "$branch" ]; then
      materialize_specs "$pkg" "$branch"
      if [ "$?" -eq 0 ]; then
        status=0
        label="restored (atom $branch; v$tag was CoffeeScript only, $tag_coffee files)"
      else
        FETCH_COFFEE="$tag_coffee"
        status=2
      fi
    fi
  fi

  if [ "$status" -eq 3 ]; then
    printf '%-30s %s\n' "$pkg" "no upstream spec (fetch failed)"
    return 0
  fi
  if [ "$status" -eq 4 ]; then
    printf '%-30s %s\n' "$pkg" "no upstream spec"
    return 0
  fi
  if [ "$status" -eq 2 ]; then
    printf '%-30s %s\n' "$pkg" "no usable spec (CoffeeScript only, $FETCH_COFFEE files)"
    return 0
  fi

  local coffee js
  coffee="$FETCH_COFFEE"
  js="$FETCH_JS"

  # Upstream spec helpers are ES modules behind a /** @babel */ pragma. This
  # runner does not transpile them, and one unloadable helper fails the whole
  # suite, so they are rewritten to CommonJS on the way in.
  local converted=0
  while IFS= read -r esm; do
    [ -n "$esm" ] || continue
    node -e '
      const fs = require("fs");
      const file = process.argv[1];
      let src = fs.readFileSync(file, "utf8");
      const names = [];
      src = src.replace(/^export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)/gm, (m, isAsync, name) => {
        names.push(name);
        return `${isAsync || ""}function ${name}`;
      });
      src = src.replace(/^\/\*\*\s*@babel\s*\*\/\s*\n/m, "");
      if (names.length) {
        src += `\nmodule.exports = Object.assign(module.exports || {}, { ${names.join(", ")} });\n`;
      }
      fs.writeFileSync(file, src);
    ' "$esm"
    converted=$((converted + 1))
  done <<< "$(grep -rl '^export ' "packages/$pkg/spec" 2>/dev/null)"

  # require('atom') is the upstream module name. The global `atom` is aliased
  # by the spec runner, but the module is not — it is `chevron` here.
  local renamed
  renamed="$(grep -rl "require('atom')\|require(\"atom\")" "packages/$pkg/spec" 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$renamed" -gt 0 ]; then
    grep -rl "require('atom')\|require(\"atom\")" "packages/$pkg/spec" 2>/dev/null |
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        sed -i "s/require('atom')/require('chevron')/g; s/require(\"atom\")/require(\"chevron\")/g" "$f"
      done
  fi

  if [ "$coffee" -gt 0 ]; then
    label="$label, $js js kept, $coffee coffee skipped"
  fi
  if [ "$renamed" -gt 0 ]; then
    label="$label, $renamed require('atom') rewritten"
  fi
  if [ "$converted" -gt 0 ]; then
    label="$label, $converted esm helper(s) converted"
  fi
  printf '%-30s %s\n' "$pkg" "$label"
}

if [ "${1:-}" = "--list" ]; then
  missing_packages
  exit 0
fi

if [ "$#" -gt 0 ]; then
  for pkg in "$@"; do restore_one "$pkg"; done
else
  while read -r pkg; do restore_one "$pkg"; done < <(missing_packages)
fi
