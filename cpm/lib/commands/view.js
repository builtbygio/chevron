'use strict';

const { getPackage, getRegistryBaseUrl } = require('../registry');

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

  if (options.json) {
    process.stdout.write(JSON.stringify(pkg, null, 2) + '\n');
    return 0;
  }

  const latest = (pkg.releases && pkg.releases.latest) || 'unknown';
  const repo =
    (pkg.repository && (pkg.repository.url || pkg.repository)) || '';
  process.stdout.write(`${pkg.name}@${latest}\n`);
  process.stdout.write(`registry:   ${getRegistryBaseUrl()}\n`);
  if (pkg.description) process.stdout.write(`description: ${pkg.description}\n`);
  process.stdout.write(`downloads:  ${pkg.downloads}\n`);
  process.stdout.write(`stars:      ${pkg.stars}\n`);
  if (repo) process.stdout.write(`repository: ${repo}\n`);
  if (pkg.metadata && pkg.metadata.engines) {
    process.stdout.write(
      `engines:    ${JSON.stringify(pkg.metadata.engines)}\n`
    );
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

module.exports = { viewCommand };
