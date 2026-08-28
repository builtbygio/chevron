#!/usr/bin/env bash
# Decide whether a changed-file list is docs-only.
#
# Prints "true" when every changed path is under docs/ or ends in .md, and
# "false" otherwise — including when the list is empty, because "no diff" must
# never be read as "safe to skip the build".
#
# Reads the file list on stdin, one path per line.
#
# This lives in a script, not inline in ci.yml, so it can be tested. The inline
# version used `... | grep -qvE ...` under `set -o pipefail`: grep -q exits on
# the first match and closes the pipe, printf takes SIGPIPE, pipefail turns the
# pipeline into a failure, and the negation flipped that into "docs-only". It
# misfired only when the list was long enough for grep to exit before printf
# finished — so the larger the change, the likelier CI skipped verifying it.
set -euo pipefail

files="$(cat)"

if [ -z "$files" ]; then
  echo false
  exit 0
fi

# No -q: read the whole stream, so there is no SIGPIPE to misread.
non_docs="$(printf '%s\n' "$files" | grep -vE '(^docs/|\.md$)' || true)"

if [ -z "$non_docs" ]; then
  echo true
else
  echo false
fi
