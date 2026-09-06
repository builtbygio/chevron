'use strict';

/**
 * Two reports from the packaged app, one cause.
 *
 * The Install panel showed chevron-lsp-c as installed while the Packages panel
 * showed it as not installed. Install reads the owned catalog, which uses the
 * package id; Packages reads `cpm ls --json`, which reports the npm publish
 * name `@builtbygio/chevron-lsp-c`. Nothing in the editor answers to the
 * scoped name -- `isPackageLoaded` and `getAvailablePackageNames` are keyed by
 * the id, per src/main-process/package-id.js -- so the card asked about a
 * package that, under that name, does not exist.
 *
 * The same scoped name was interpolated into the package links, which pointed
 * at packages.pulsar-edit.dev. Chevron has no registry of its own; the owned
 * catalog is published to npm, which is where the links go now.
 *
 * Run: node --test script/ci/settings-view-package-identity.test.js
 */

const { describe, it } = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const LIB = path.join(ROOT, 'packages', 'settings-view', 'lib');

const { normalizeInstalledNames } = require(path.join(LIB, 'package-identity'));
const { npmPackageUrl } = require(path.join(LIB, 'npm-package-url'));
const { packageIdFromName } = require(path.join(
  ROOT, 'src', 'main-process', 'package-id'
));

describe('cpm publish names are normalised to package ids', () => {
  it('a scoped name becomes the id, keeping the npm name', () => {
    // The shape `cpm ls --json` actually returns.
    const listing = {
      user: [
        { name: '@builtbygio/chevron-lsp-c', version: '0.1.0' },
        { name: 'chevron-lsp-typescript', version: '0.1.0' }
      ],
      core: [{ name: '@builtbygio/about', version: '1.9.3' }]
    };
    normalizeInstalledNames(listing, packageIdFromName);

    assert.equal(listing.user[0].name, 'chevron-lsp-c');
    assert.equal(listing.user[0].publishName, '@builtbygio/chevron-lsp-c');
    assert.equal(listing.core[0].name, 'about');

    // An unscoped name is already an id and gains no publishName.
    assert.equal(listing.user[1].name, 'chevron-lsp-typescript');
    assert.equal(listing.user[1].publishName, undefined);
  });

  it('survives buckets and entries it cannot read', () => {
    const listing = { user: null, git: [null, {}, { name: 5 }], count: 3 };
    assert.doesNotThrow(() => normalizeInstalledNames(listing, packageIdFromName));
    assert.equal(normalizeInstalledNames(null, packageIdFromName), null);
  });

  it('the editor exposes the rule the panel needs', () => {
    // settings-view is a package: it cannot require src/. Without this method
    // it has to reimplement the scope rule and drift from it.
    const source = fs.readFileSync(
      path.join(ROOT, 'src', 'package-manager.js'), 'utf8'
    );
    assert.match(source, /getPackageId\(name\)\s*\{\s*return packageIdFromName\(name\);/);
  });
});

describe('package links point at the registry Chevron actually uses', () => {
  it('links to npm, by publish name where there is one', () => {
    assert.equal(
      npmPackageUrl({ name: 'chevron-lsp-c', publishName: '@builtbygio/chevron-lsp-c' }),
      'https://www.npmjs.com/package/@builtbygio/chevron-lsp-c'
    );
    assert.equal(
      npmPackageUrl({ name: 'chevron-lsp-typescript' }),
      'https://www.npmjs.com/package/chevron-lsp-typescript'
    );
  });

  it('nothing in settings-view still points at Pulsar', () => {
    const offenders = [];
    for (const entry of fs.readdirSync(LIB)) {
      if (!/\.(js|ts)$/.test(entry)) continue;
      const source = fs.readFileSync(path.join(LIB, entry), 'utf8');
      source.split('\n').forEach((line, i) => {
        if (/pulsar-edit\.dev|Atom\.io/.test(line)) {
          offenders.push(`${entry}:${i + 1}  ${line.trim().slice(0, 100)}`);
        }
      });
    }
    assert.deepEqual(
      offenders,
      [],
      'Chevron does not use the Pulsar registry; these send users to a host ' +
        'that does not carry these packages:\n  ' + offenders.join('\n  ')
    );
  });
});
