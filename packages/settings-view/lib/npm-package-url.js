// Chevron has no package registry of its own: the owned catalog is published
// to npm under `@builtbygio/`, and cpm installs from there. Package links
// previously pointed at a registry that does not carry these packages.
//
// `publishName` is the npm name, set where a name is normalised to the
// unscoped package id; `name` is the id itself, which is the right link for a
// package published unscoped.
function npmPackageUrl(pack) {
  const published =
    pack && typeof pack.publishName === 'string' && pack.publishName.length > 0
      ? pack.publishName
      : pack && pack.name;
  return `https://www.npmjs.com/package/${published}`;
}

module.exports = { npmPackageUrl };
