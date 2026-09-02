const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../config');
const FINGERPRINT_PATH = path.join(
  CONFIG.repositoryRootPath,
  'node_modules',
  '.dependencies-fingerprint'
);

// Deterministic JSON: objects emitted with sorted keys at every depth, so the
// hash tracks content and not authoring order.
function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.keys(value)
      .sort()
      .map(k => JSON.stringify(k) + ':' + canonical(value[k]))
      .join(',') +
    '}'
  );
}

module.exports = {
  write: function() {
    const fingerprint = this.compute();
    fs.writeFileSync(FINGERPRINT_PATH, fingerprint);
    console.log(
      'Wrote Dependencies Fingerprint:',
      FINGERPRINT_PATH,
      fingerprint
    );
  },
  read: function() {
    return fs.existsSync(FINGERPRINT_PATH)
      ? fs.readFileSync(FINGERPRINT_PATH, 'utf8')
      : null;
  },
  isOutdated: function() {
    const fingerprint = this.read();
    return fingerprint ? fingerprint !== this.compute() : false;
  },
  // The dependency-relevant half of every workspace manifest.
  //
  // The lockfile alone cannot stand in for these. Editing a package's
  // dependencies does not change pnpm-lock.yaml until an install runs, so a
  // fingerprint built only from the lockfile still matches, bootstrap-modern
  // skips `pnpm install`, and the install that would have updated the lockfile
  // never happens. The tree then looks bootstrapped while the manifest and the
  // lockfile disagree -- silently, and for as many bootstrap runs as you care
  // to do.
  //
  // Only the fields that can change resolution are hashed: a reworded
  // description should not cost a reinstall. `name` and `version` are in
  // because workspace:* links resolve through them.
  manifestPart: function() {
    const manifests = [path.join(CONFIG.repositoryRootPath, 'package.json')];
    const packagesDir = path.join(CONFIG.repositoryRootPath, 'packages');
    let entries = [];
    try {
      entries = fs.readdirSync(packagesDir).sort();
    } catch (error) {
      entries = [];
    }
    for (const entry of entries) {
      const manifest = path.join(packagesDir, entry, 'package.json');
      if (fs.existsSync(manifest)) manifests.push(manifest);
    }

    const parts = [];
    for (const file of manifests) {
      let json;
      try {
        json = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (error) {
        // An unparseable manifest is a real change in its own right; hash the
        // bytes rather than skipping it and pretending nothing moved.
        parts.push(file + ':unparseable:' + fs.readFileSync(file).toString('hex').slice(0, 32));
        continue;
      }
      const relevant = {
        name: json.name,
        version: json.version,
        dependencies: json.dependencies,
        devDependencies: json.devDependencies,
        optionalDependencies: json.optionalDependencies,
        peerDependencies: json.peerDependencies,
        packageDependencies: json.packageDependencies,
        resolutions: json.resolutions,
        pnpm: json.pnpm
      };
      // Stable key order, so a reordered manifest is not a new fingerprint.
      //
      // Not JSON.stringify's array replacer: that is a key allowlist applied
      // at EVERY level, so it would strip the package names inside
      // `dependencies` and hash an empty object -- which silently defeats the
      // whole point, since every manifest then fingerprints the same.
      parts.push(
        path.relative(CONFIG.repositoryRootPath, file) + '\u0000' + canonical(relevant)
      );
    }
    return crypto
      .createHash('sha1')
      .update(parts.join('\u0001'))
      .digest('hex')
      .slice(0, 16);
  },

  compute: function() {
    // Electron minor + lockfile identity + workspace manifests + host Node.
    const electronVersion = CONFIG.appMetadata.electronVersion.replace(
      /\.\d+$/,
      ''
    );
    const lockPath = [
      path.join(CONFIG.repositoryRootPath, 'pnpm-lock.yaml'),
      path.join(CONFIG.repositoryRootPath, 'package-lock.json')
    ].find(p => fs.existsSync(p));
    let lockPart = 'nolock';
    if (lockPath) {
      lockPart = crypto
        .createHash('sha1')
        .update(fs.readFileSync(lockPath))
        .digest('hex')
        .slice(0, 16);
    }
    const body =
      electronVersion +
      lockPart +
      this.manifestPart() +
      process.platform +
      process.version +
      process.arch +
      'host-pnpm';
    return crypto
      .createHash('sha1')
      .update(body)
      .digest('hex');
  }
};
