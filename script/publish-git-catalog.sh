#!/usr/bin/env bash
# Publish bundled *git-pinned* catalog packages as @builtbygio/<id> on npmjs.
# In-repo packages/* use script/publish-owned-packages.sh instead.
#
# Batches:
#   languages  — language-* git pins (default first wave)
#   ui         — remaining bundled git pins (tree-view, settings-view, …)
#   all        — languages then ui
#
# Requires npm auth (Automation token on @builtbygio). Does not store tokens.
#
#   ./script/publish-git-catalog.sh languages
#   ./script/publish-git-catalog.sh ui
set -euo pipefail
cd "$(dirname "$0")/.."

BATCH="${1:-languages}"

LANGUAGES=(
  language-c language-clojure language-coffee-script language-csharp
  language-css language-gfm language-git language-go language-html
  language-hyperlink language-java language-javascript language-json
  language-less language-make language-mustache language-objective-c
  language-perl language-php language-property-list language-python
  language-ruby language-ruby-on-rails language-sass language-shellscript
  language-source language-sql language-text language-todo language-toml
  language-typescript language-xml language-yaml
)

UI=(
  archive-view autocomplete-chevron-api autocomplete-css autocomplete-html
  autocomplete-plus autocomplete-snippets autosave background-tips bookmarks
  bracket-matcher command-palette encoding-selector find-and-replace
  fuzzy-finder github image-view keybinding-resolver markdown-preview
  notifications open-on-github package-generator settings-view snippets
  spell-check status-bar styleguide symbols-view tabs timecop tree-view
  whitespace wrap-guide
)

ids=()
case "$BATCH" in
  languages) ids=("${LANGUAGES[@]}") ;;
  ui) ids=("${UI[@]}") ;;
  all) ids=("${LANGUAGES[@]}" "${UI[@]}") ;;
  *)
    echo "usage: $0 languages|ui|all" >&2
    exit 2
    ;;
esac

OTP=()
if [[ "${2:-}" == "--otp" ]]; then
  OTP=(--otp "$3")
fi

node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"))' >/dev/null

ok=0
skipped=0
failed=0

for id in "${ids[@]}"; do
  src="node_modules/$id"
  if [[ ! -f "$src/package.json" ]]; then
    echo "FAIL $id (missing $src)"
    failed=$((failed + 1))
    continue
  fi
  ver=$(node -p "require('./package.json').packageDependencies['$id'] || require('./$src/package.json').version")
  name="@builtbygio/$id"
  if npm view "$name@$ver" version >/dev/null 2>&1; then
    echo "skip $name@$ver (already on registry)"
    skipped=$((skipped + 1))
    continue
  fi
  stage=$(mktemp -d)
  # Copy package files without nested node_modules / VCS.
  tar -C "$src" --exclude=node_modules --exclude=.git --exclude=spec --exclude=test \
    -cf - . | tar -C "$stage" -xf -
  node -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$stage/package.json', 'utf8'));
    p.name = '$name';
    p.version = '$ver';
    p.engines = Object.assign({}, p.engines, { chevron: '*' });
    delete p.private;
    fs.writeFileSync('$stage/package.json', JSON.stringify(p, null, 2) + '\n');
  "
  echo "=== npm publish $name@$ver from $id ==="
  if (cd "$stage" && npm publish --access public --ignore-scripts "${OTP[@]}"); then
    ok=$((ok + 1))
  else
    echo "FAIL $name@$ver"
    failed=$((failed + 1))
  fi
  rm -rf "$stage"
done

echo "published=$ok skipped=$skipped failed=$failed"
if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
