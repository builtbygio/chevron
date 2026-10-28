'use strict';

const fs = require('fs');
const path = require('path');
const checker = require('license-checker-rseidelsohn');

const licenseOverrides = require('../license-overrides');
const CONFIG = require('../config');

function relativizeSource(source, root) {
  if (!source || typeof source !== 'string') return source;
  const resolvedRoot = path.resolve(root);
  // Absolute license-file paths differ across machines; keep repo-relative.
  if (path.isAbsolute(source)) {
    const resolved = path.resolve(source);
    if (
      resolved === resolvedRoot ||
      resolved.startsWith(resolvedRoot + path.sep)
    ) {
      return path
        .relative(resolvedRoot, resolved)
        .split(path.sep)
        .join('/');
    }
  }
  return source;
}

function normalizeText(text) {
  if (text == null) return text;
  return String(text).replace(/\r\n/g, '\n');
}

function formatLicense(licenses) {
  if (Array.isArray(licenses)) return licenses.join(' OR ');
  return licenses;
}

function isBuildToolPackage(packagePath, root) {
  if (!packagePath) return false;
  const rel = path.relative(path.resolve(root), path.resolve(packagePath));
  if (rel.startsWith('..')) return false;
  return (
    rel === 'script' ||
    rel.startsWith(`script${path.sep}`) ||
    rel === 'cpm' ||
    rel.startsWith(`cpm${path.sep}`)
  );
}

module.exports = function() {
  return new Promise((resolve, reject) => {
    checker.init(
      {
        start: CONFIG.repositoryRootPath,
        production: true,
        customFormat: {
          name: '',
          licenseText: '',
          licenseFile: '',
          path: ''
        }
      },
      (err, packages) => {
        if (err) {
          reject(err);
          return;
        }

        const root = CONFIG.repositoryRootPath;
        const packagesLicenses = {};
        for (const [packageName, info] of Object.entries(packages)) {
          // Build tooling is not shipped in the app; including it also makes
          // LICENSE.md arch-dependent (optional native deps under script/).
          if (isBuildToolPackage(info.path, root)) continue;

          packagesLicenses[packageName] = {
            license: formatLicense(info.licenses),
            source: relativizeSource(
              info.repository || info.licenseFile,
              root
            ),
            sourceText: normalizeText(info.licenseText)
          };
        }

        for (const [packageName, override] of Object.entries(licenseOverrides)) {
          const merged = Object.assign(
            {},
            packagesLicenses[packageName],
            override
          );
          if (merged.source) {
            merged.source = relativizeSource(merged.source, root);
          }
          if (merged.sourceText) {
            merged.sourceText = normalizeText(merged.sourceText);
          }
          packagesLicenses[packageName] = merged;
        }

        let text =
          normalizeText(
            fs.readFileSync(path.join(root, 'LICENSE.md'), 'utf8')
          ) +
          '\n\n' +
          'This application bundles the following third-party packages in accordance\n' +
          'with the following licenses:\n\n';
        for (let packageName of Object.keys(packagesLicenses).sort()) {
          const packageLicense = packagesLicenses[packageName];
          text +=
            '-------------------------------------------------------------------------\n\n';
          text += `Package: ${packageName}\n`;
          text += `License: ${packageLicense.license}\n`;
          if (packageLicense.source) {
            text += `License Source: ${packageLicense.source}\n`;
          }
          if (packageLicense.sourceText) {
            text += `Source Text:\n\n${packageLicense.sourceText}`;
          }
          text += '\n';
        }
        resolve(text);
      }
    );
  });
};

module.exports._test = {
  relativizeSource,
  normalizeText,
  formatLicense,
  isBuildToolPackage
};
