'use strict';

require('colors');

const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3456;

// Local Squirrel test server only. express-rate-limit is a CodeQL-recognized
// barrier for js/missing-rate-limiting on the sendFile routes below.
app.use(
  rateLimit({
    windowMs: 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
  })
);

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

/**
 * Basename-only asset under out/. Express sendFile({ root }) is the
 * CodeQL-safe path pattern (no user string in the absolute path).
 */
function safeAssetName(fileName) {
  const base = path.basename(String(fileName || ''));
  if (!/^[\w.+-]+$/.test(base)) return null;
  if (!fs.existsSync(path.join(buildPath, base))) return null;
  return base;
}

function sendAsset(res, fileName) {
  const base = safeAssetName(fileName);
  if (!base) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(base, { root: buildPath });
}

console.log(
  `Serving ${
    appMetadata.productName
  } release assets (channel = ${releaseChannel})\n`.green
);

function getMacZip(req, res) {
  console.log('Received request for atom-mac.zip, sending it');
  sendAsset(res, 'atom-mac.zip');
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

    sendAsset(res, fileName);
  };
}

function getNupkgFile(is64bit) {
  return function(req, res) {
    let nupkgFile = path.basename(String(req.params.nupkg || ''));
    if (is64bit) {
      // Character class (not `.+`) — linear time; avoids polynomial ReDoS.
      const nupkgMatch = nupkgFile.match(
        /^atom-([A-Za-z0-9._-]+)-(delta|full)\.nupkg$/
      );
      if (nupkgMatch) {
        nupkgFile = `atom-x64-${nupkgMatch[1]}-${nupkgMatch[2]}.nupkg`;
      }
    }

    console.log(
      'Received request for %s, sending %s',
      String(req.params.nupkg || ''),
      nupkgFile
    );
    sendAsset(res, nupkgFile);
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
