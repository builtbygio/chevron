const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const semver = require('semver');

// this may be updated to use github releases instead
const apm = async function({ dependencies, packageDependencies }) {
  try {
    console.log('Checking apm registry...');
    const coreDependencies = Object.keys(dependencies).filter(dependency => {
      // all core packages point to a remote url
      return dependencies[dependency].match(new RegExp('^https?://'));
    });

    const promises = coreDependencies.map(async dependency => {
      return fetch(`https://atom.io/api/packages/${dependency}`)
        .then(res => res.json())
        .then(res => res)
        .catch(ex => console.log(ex.message));
    });

    const packages = await Promise.all(promises);
    const outdatedPackages = [];
    packages.map(dependency => {
      if (dependency.hasOwnProperty('name')) {
        const latestVersion = dependency.releases.latest;
        const installed = packageDependencies[dependency.name];
        if (latestVersion > installed) {
          outdatedPackages.push({
            moduleName: dependency.name,
            latest: dependency.releases.latest,
            isCorePackage: true,
            installed
          });
        }
      }
    });

    console.log(`${outdatedPackages.length} outdated package(s) found`);

    return outdatedPackages;
  } catch (ex) {
    console.error(`An error occured: ${ex.message}`);
  }
};

const npm = async function(cwd) {
  try {
    console.log('Checking npm registry...', cwd);

    const result = spawnSync(
      'npm',
      ['outdated', '--json', '--omit=dev'],
      { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    // npm outdated exits 1 when anything is outdated; still prints JSON on stdout.
    const raw = result.stdout && result.stdout.trim();
    if (!raw) {
      if (result.status !== 0 && result.stderr) {
        throw new Error(result.stderr.trim() || `npm outdated exited ${result.status}`);
      }
      console.log('0 outdated package(s) found');
      return [];
    }

    const outdated = JSON.parse(raw);
    const packageJsonPath = path.join(cwd, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const declared = packageJson.dependencies || {};

    const outdatedPackages = Object.keys(outdated)
      .map(moduleName => {
        const info = outdated[moduleName];
        const installed = info.current;
        const latest = info.latest;
        if (!installed || !latest) return null;
        if (!semver.valid(installed) || !semver.valid(latest)) return null;
        if (!semver.gt(latest, installed)) return null;
        return {
          packageJson: declared[moduleName] || installed,
          installed,
          moduleName,
          latest,
          isCorePackage: false
        };
      })
      .filter(Boolean);

    console.log(`${outdatedPackages.length} outdated package(s) found`);

    return outdatedPackages;
  } catch (ex) {
    console.error(`An error occured: ${ex.message}`);
  }
};

module.exports = {
  apm,
  npm
};
