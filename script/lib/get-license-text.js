'use strict';

const fs = require('fs');
const path = require('path');
const checker = require('license-checker-rseidelsohn');

const licenseOverrides = require('../license-overrides');
const CONFIG = require('../config');

module.exports = function() {
  return new Promise((resolve, reject) => {
    checker.init(
      {
        start: CONFIG.repositoryRootPath,
        production: true,
        customFormat: {
          name: '',
          licenseText: '',
          licenseFile: ''
        }
      },
      (err, packages) => {
        if (err) {
          reject(err);
          return;
        }

        const packagesLicenses = {};
        for (const [packageName, info] of Object.entries(packages)) {
          packagesLicenses[packageName] = {
            license: info.licenses,
            source: info.licenseFile || info.repository,
            sourceText: info.licenseText
          };
        }

        for (const [packageName, override] of Object.entries(licenseOverrides)) {
          packagesLicenses[packageName] = Object.assign(
            {},
            packagesLicenses[packageName],
            override
          );
        }

        let text =
          fs.readFileSync(
            path.join(CONFIG.repositoryRootPath, 'LICENSE.md'),
            'utf8'
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
