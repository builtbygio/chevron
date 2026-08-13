require('colors');

const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const port = process.env.PORT || 3456;

// Local Squirrel test server only — cap request rate so CodeQL is happy
// and a runaway client cannot hammer disk.
const hits = [];
app.use((req, res, next) => {
  const now = Date.now();
  while (hits.length && now - hits[0] > 1000) hits.shift();
  if (hits.length >= 30) {
    res.sendStatus(429);
    return;
  }
  hits.push(now);
  next();
});

// Load the metadata for the local build of Atom
const buildPath = path.resolve(__dirname, '..', '..', 'out');
const packageJsonPath = path.join(buildPath, 'app', 'package.json');
if (!fs.existsSync(buildPath) || !fs.existsSync(packageJsonPath)) {
  console.log(
    `This script requires a full Atom build with release packages for the current platform in the following path:\n    ${buildPath}\n`
  );
  if (process.platform === 'darwin') {
    console.log(
      `Run this command before trying again:\n    script/build --compress-artifacts --test-sign\n\n`
    );
  } else if (process.platform === 'win32') {
    console.log(
      `Run this command before trying again:\n    script/build --create-windows-installer\n\n`
    );
  }
  process.exit(1);
}

const appMetadata = require(packageJsonPath);
const versionMatch = appMetadata.version.match(/-(beta|nightly)\d+$/);
const releaseChannel = versionMatch ? versionMatch[1] : 'stable';

function safeAssetPath(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!/^[\w.+-]+$/.test(base)) return null;
  const full = path.resolve(buildPath, base);
  const root = buildPath.endsWith(path.sep) ? buildPath : buildPath + path.sep;
  if (full !== buildPath && !full.startsWith(root)) return null;
  return full;
}

console.log(
  `Serving ${
    appMetadata.productName
  } release assets (channel = ${releaseChannel})\n`.green
);

function getMacZip(req, res) {
  console.log(`Received request for atom-mac.zip, sending it`);
  const filePath = safeAssetPath('atom-mac.zip');
  if (!filePath) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(filePath);
}

function getMacUpdates(req, res) {
  const requested = String(req.query.version || '');
  if (requested !== appMetadata.version) {
    const updateInfo = {
      name: appMetadata.version,
      pub_date: new Date().toISOString(),
      url: `http://localhost:${port}/mac/atom-mac.zip`,
      notes: '<p>No Details</p>'
    };

    console.log(
      'Received request for macOS updates (version = %s), sending',
      requested,
      updateInfo
    );
    res.json(updateInfo);
  } else {
    console.log(
      'Received request for macOS updates, sending 204 as Atom is up to date (version = %s)',
      requested
    );
    res.sendStatus(204);
  }
}

function getReleasesFile(fileName) {
  return function(req, res) {
    const requested = String(req.query.version || '');
    console.log('Received request for %s, version: %s', fileName, requested);
    if (requested) {
      const versionMatch = requested.match(/-(beta|nightly)\d+$/);
      const versionChannel = (versionMatch && versionMatch[1]) || 'stable';
      if (releaseChannel !== versionChannel) {
        console.log(
          'Atom requested an update for version %s but the current release channel is %s',
          requested,
          releaseChannel
        );
        res.sendStatus(404);
        return;
      }
    }

    const filePath = safeAssetPath(fileName);
    if (!filePath) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(filePath);
  };
}

function getNupkgFile(is64bit) {
  return function(req, res) {
    let nupkgFile = path.basename(String(req.params.nupkg || ''));
    if (is64bit) {
      const nupkgMatch = nupkgFile.match(
        /^atom-([A-Za-z0-9._-]+)-(delta|full)\.nupkg$/
      );
      if (nupkgMatch) {
        nupkgFile = `atom-x64-${nupkgMatch[1]}-${nupkgMatch[2]}.nupkg`;
      }
    }

    const filePath = safeAssetPath(nupkgFile);
    console.log(
      'Received request for %s, sending %s',
      String(req.params.nupkg || ''),
      nupkgFile
    );
    if (!filePath) {
      res.sendStatus(404);
      return;
    }
    res.sendFile(filePath);
  };
}

if (process.platform === 'darwin') {
  app.get('/mac/atom-mac.zip', getMacZip);
  app.get('/api/updates', getMacUpdates);
} else if (process.platform === 'win32') {
  app.get('/api/updates/RELEASES', getReleasesFile('RELEASES'));
  app.get('/api/updates/:nupkg', getNupkgFile());
  app.get('/api/updates-x64/RELEASES', getReleasesFile('RELEASES-x64'));
  app.get('/api/updates-x64/:nupkg', getNupkgFile(true));
} else {
  console.log(
    `The current platform '${
      process.platform
    }' doesn't support Squirrel updates, exiting.`.red
  );
  process.exit(1);
}

app.listen(port, () => {
  console.log(
    `Run Atom with ATOM_UPDATE_URL_PREFIX="http://localhost:${port}" set to test updates!\n`
      .yellow
  );
});
