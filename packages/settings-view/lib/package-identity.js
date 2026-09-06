// cpm reports npm publish names (`@builtbygio/chevron-lsp-c`); Chevron
// identifies packages by the unscoped id, which is what `isPackageLoaded` and
// `getAvailablePackageNames` answer to. Left scoped, a card reports a package
// it can see as not installed, and links to it under a name nothing resolves.
//
// `toPackageId` is `chevron.packages.getPackageId` -- injected so this stays
// testable outside the app.
function normalizeInstalledNames(packages, toPackageId) {
  if (packages == null || typeof packages !== 'object') return packages;
  for (const bucket of Object.keys(packages)) {
    if (!Array.isArray(packages[bucket])) continue;
    for (const pack of packages[bucket]) {
      if (pack == null || typeof pack.name !== 'string') continue;
      const id = toPackageId(pack.name);
      if (id !== pack.name) {
        pack.publishName = pack.name;
        pack.name = id;
      }
    }
  }
  return packages;
}

module.exports = { normalizeInstalledNames };
