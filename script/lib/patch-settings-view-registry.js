'use strict';

/**
 * Force settings-view package registry URLs off dead atom.io → Pulsar.
 *
 * Run:
 *  - bootstrap (via patch-packages-remote-ipc)
 *  - after coffee transpile on intermediate app (script/build)
 *  - ad-hoc: node script/lib/patch-settings-view-registry.js [appRoot]
 */

const fs = require('fs');
const path = require('path');

const COFFEE_DEFAULT = `@baseURL ?= (process.env.CPM_REGISTRY_URL || process.env.ATOM_PACKAGE_REGISTRY || 'https://api.pulsar-edit.dev').replace(/\\/+$/, '') + '/api/'`;

const JS_DEFAULT_ASSIGN = `this.baseURL = (process.env.CPM_REGISTRY_URL || process.env.ATOM_PACKAGE_REGISTRY || 'https://api.pulsar-edit.dev').replace(/\\/+$/, '') + '/api/';`;

function patchFile(abs, transform) {
  if (!fs.existsSync(abs)) return false;
  const before = fs.readFileSync(abs, 'utf8');
  const after = transform(before);
  if (after === before) return false;
  fs.writeFileSync(abs, after);
  return true;
}

function patchSettingsViewTree(root) {
  const lib = path.join(root, 'node_modules', 'settings-view', 'lib');
  let n = 0;

  if (
    patchFile(path.join(lib, 'atom-io-client.coffee'), t => {
      if (t.includes('api.pulsar-edit.dev') && !t.includes('https://atom.io/api/')) {
        return t;
      }
      let out = t.replace(
        /@baseURL \?= 'https:\/\/atom\.io\/api\/'/,
        COFFEE_DEFAULT
      );
      // Already env-based but wrong host
      out = out.replace(/'https:\/\/atom\.io'/g, "'https://api.pulsar-edit.dev'");
      return out;
    })
  ) {
    n++;
    console.log('  patched atom-io-client.coffee → Pulsar');
  }

  if (
    patchFile(path.join(lib, 'atom-io-client.js'), t => {
      if (t.includes('api.pulsar-edit.dev') && !t.includes('https://atom.io/api/')) {
        return t;
      }
      let out = t;
      out = out.replace(
        /this\.baseURL = 'https:\/\/atom\.io\/api\/';/g,
        JS_DEFAULT_ASSIGN
      );
      out = out.replace(/'https:\/\/atom\.io\/api\/'/g, PULSAR_API_EXPR_JS());
      out = out.replace(/'https:\/\/atom\.io'/g, "'https://api.pulsar-edit.dev'");
      out = out.replace(/"https:\/\/atom\.io\/api\/"/g, PULSAR_API_EXPR_JS());
      return out;
    })
  ) {
    n++;
    console.log('  patched atom-io-client.js → Pulsar');
  }

  if (
    patchFile(path.join(lib, 'install-panel.js'), t => {
      if (t.includes('packages.pulsar-edit.dev') && !t.includes('https://atom.io/')) {
        return t;
      }
      return t
        .replace(
          /https:\/\/atom\.io\/packages/g,
          'https://packages.pulsar-edit.dev/packages'
        )
        .replace(
          /https:\/\/atom\.io\/themes/g,
          'https://packages.pulsar-edit.dev/themes'
        )
        .replace(/>atom\.io</g, '>packages.pulsar-edit.dev<')
        .replace(/'atom\.io'/g, "'packages.pulsar-edit.dev'")
        .replace(/"atom\.io"/g, '"packages.pulsar-edit.dev"')
        .replace(/Packages are published to /g, 'Packages are listed on ')
        .replace(/Themes are published to /g, 'Themes are listed on ');
    })
  ) {
    n++;
    console.log('  patched install-panel.js → Pulsar');
  }

  for (const name of ['package-card.js', 'package-detail-view.js']) {
    if (
      patchFile(path.join(lib, name), t => {
        if (
          t.includes('packages.pulsar-edit.dev') &&
          !t.includes('https://atom.io/')
        ) {
          return t;
        }
        return t
          .replace(/https:\/\/atom\.io\/users\//g, 'https://github.com/')
          .replace(
            /https:\/\/atom\.io\/packages\//g,
            'https://packages.pulsar-edit.dev/packages/'
          )
          .replace(
            /https:\/\/atom\.io\/' \+ packageType \+ '\//g,
            "https://packages.pulsar-edit.dev/' + packageType + '/"
          )
          .replace(
            /https:\/\/atom\.io\/\$\{packageType\}\//g,
            'https://packages.pulsar-edit.dev/${packageType}/'
          );
      })
    ) {
      n++;
      console.log(`  patched ${name} → Pulsar`);
    }
  }

  for (const name of ['package-manager.js', 'package-manager.coffee']) {
    if (
      patchFile(path.join(lib, name), t => {
        if (!t.includes('atom.io')) return t;
        return t
          .replace(/https:\/\/atom\.io/g, 'https://api.pulsar-edit.dev')
          .replace(/http:\/\/atom\.io/g, 'https://api.pulsar-edit.dev');
      })
    ) {
      n++;
      console.log(`  patched ${name} proxy host → Pulsar`);
    }
  }

  return n;
}

function PULSAR_API_EXPR_JS() {
  return `(process.env.CPM_REGISTRY_URL || process.env.ATOM_PACKAGE_REGISTRY || 'https://api.pulsar-edit.dev').replace(/\\/+$/, '') + '/api/'`;
}

module.exports = function patchSettingsViewRegistry(appRoot) {
  const root = appRoot || path.join(__dirname, '..', '..');
  console.log(`Patching settings-view registry URLs under ${root}`);
  const n = patchSettingsViewTree(root);
  if (n === 0) {
    console.log('  (settings-view already on Pulsar or package missing)');
  }
  return n;
};

if (require.main === module) {
  module.exports(process.argv[2]);
}
