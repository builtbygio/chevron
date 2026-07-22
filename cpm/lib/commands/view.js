'use strict';

/**
 * Package metadata for humans and for settings-view:
 *   cpm view <name> --json
 *   cpm view <name> --json --compatible <productVersion>
 *
 * Classic apm emitted a flattened package object with top-level `version`.
 * With --compatible, pick the newest published version whose engines.atom
 * satisfies the product version (settings-view loadCompatiblePackageVersion).
 */

const semver = require('semver');
const {
  getPackage,
  getRegistryBaseUrl,
  toApmPackageShape
} = require('../registry');

/**
 * Build apm/settings-view shaped pack from getPackage() result, optionally
 * selecting a compatible version.
 */
function packageForView(pkg, compatibleVersion) {
  const versions = pkg.versions || {};
  const versionNames = Object.keys(versions);

  let chosenVersion = null;
  let chosenMeta = null;

  if (compatibleVersion && versionNames.length) {
    const product =
      semver.coerce(String(compatibleVersion)) || String(compatibleVersion);
    const sorted = versionNames.slice().sort(semver.rcompare);
    for (const ver of sorted) {
      const entry = versions[ver] || {};
      const engine =
        (entry.engines && entry.engines.atom) ||
        (pkg.metadata && pkg.metadata.engines && pkg.metadata.engines.atom) ||
        '*';
      try {
        if (semver.satisfies(product, engine)) {
          chosenVersion = ver;
          chosenMeta = entry;
          break;
        }
      } catch (_) {
        /* try next */
      }
    }
    // No compatible release — return shape with null version so settings-view
    // can show "no compatible version" instead of crashing.
    if (!chosenVersion) {
      const base = flattenPackage(pkg, null, null);
      base.version = null;
      return base;
    }
  } else {
    chosenVersion =
      (pkg.releases && pkg.releases.latest) ||
      (pkg.metadata && pkg.metadata.version) ||
      (versionNames.length
        ? versionNames.slice().sort(semver.rcompare)[0]
        : null);
    chosenMeta = (chosenVersion && versions[chosenVersion]) || null;
  }

  return flattenPackage(pkg, chosenVersion, chosenMeta);
}

function flattenPackage(pkg, version, versionEntry) {
  const meta = pkg.metadata || {};
  const entry = versionEntry || {};
  const flat = toApmPackageShape({
    name: pkg.name,
    downloads: pkg.downloads,
    stargazers_count: pkg.stars,
    releases: pkg.releases,
    repository: pkg.repository,
    readme: pkg.readme,
    metadata: Object.assign({}, meta, {
      name: entry.name || meta.name || pkg.name,
      version: version || entry.version || meta.version || null,
      description:
        entry.description || meta.description || pkg.description || '',
      engines: entry.engines || meta.engines || null
    })
  });
  if (version) flat.version = version;
  if (pkg.readme) flat.readme = pkg.readme;
  return flat;
}

async function viewCommand(name, options = {}) {
  if (!name) {
    process.stderr.write('cpm view: package name required\n');
    return 1;
  }

  let pkg;
  try {
    pkg = await getPackage(name);
  } catch (err) {
    process.stderr.write(`cpm view: ${err.message}\n`);
    return 1;
  }

  const pack = packageForView(pkg, options.compatible);

  if (options.json) {
    process.stdout.write(JSON.stringify(pack, null, 2) + '\n');
    return 0;
  }

  const latest = pack.version || 'unknown';
  const repo =
    (pack.repository &&
      (typeof pack.repository === 'object'
        ? pack.repository.url
        : pack.repository)) ||
    '';
  process.stdout.write(`${pack.name}@${latest}\n`);
  process.stdout.write(`registry:   ${getRegistryBaseUrl()}\n`);
  if (pack.description) {
    process.stdout.write(`description: ${pack.description}\n`);
  }
  process.stdout.write(`downloads:  ${pack.downloads || 0}\n`);
  process.stdout.write(
    `stars:      ${
      pack.stargazers_count != null ? pack.stargazers_count : pack.stars || 0
    }\n`
  );
  if (repo) process.stdout.write(`repository: ${repo}\n`);
  if (pack.engines) {
    process.stdout.write(`engines:    ${JSON.stringify(pack.engines)}\n`);
  }
  const versionNames = Object.keys(pkg.versions || {});
  if (versionNames.length) {
    process.stdout.write(
      `versions:   ${versionNames.slice(0, 10).join(', ')}${
        versionNames.length > 10 ? ', …' : ''
      }\n`
    );
  }
  return 0;
}

module.exports = { viewCommand, packageForView };
