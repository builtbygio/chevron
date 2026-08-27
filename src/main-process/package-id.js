'use strict';

/**
 * Editor package id vs npm publish name.
 *
 * Owned catalog publishes as `@builtbygio/<id>` (npm org). Chevron still
 * identifies packages by the unscoped `<id>` (`require('tree-view')`,
 * `packageDependencies`, `core.disabledPackages`).
 *
 * Install with an alias so the folder stays unscoped:
 *   "tree-view": "npm:@builtbygio/tree-view@0.229.6"
 *
 * `@atom/` is not stripped — that remains the require id until an alias
 * points `@atom/watcher` at `@builtbygio/watcher`.
 */

const OWNED_NPM_SCOPE = '@builtbygio/';

function packageIdFromName(name) {
  if (typeof name !== 'string' || name.length < 1) return name;
  if (name.startsWith(OWNED_NPM_SCOPE)) {
    const id = name.slice(OWNED_NPM_SCOPE.length);
    return id.length > 0 ? id : name;
  }
  return name;
}

function applyPackageId(metadata, fallback) {
  const raw =
    metadata && typeof metadata.name === 'string' && metadata.name.length > 0
      ? metadata.name
      : fallback;
  const id = packageIdFromName(raw);
  if (metadata && id && typeof id === 'string' && id.length > 0) {
    if (metadata.name !== id) {
      metadata.publishName = metadata.name;
    }
    metadata.name = id;
  }
  return id;
}

module.exports = {
  OWNED_NPM_SCOPE,
  packageIdFromName,
  applyPackageId
};
