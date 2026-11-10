'use strict';

const fs = require('fs-extra');
const path = require('path');

function assertGitHubDownloadUrl(downloadURL) {
  const parsed = new URL(downloadURL);
  const host = parsed.hostname.toLowerCase();
  const githubHost =
    host === 'github.com' ||
    host === 'api.github.com' ||
    host === 'codeload.github.com' ||
    host === 'raw.githubusercontent.com' ||
    host.endsWith('.githubusercontent.com');
  if (parsed.protocol !== 'https:' || !githubHost || parsed.username || parsed.password) {
    throw new Error('Refusing to download from ' + parsed.hostname);
  }
}

module.exports = async function(downloadURL, destinationPath) {
  assertGitHubDownloadUrl(downloadURL);
  console.log(`Downloading file from GitHub Repository to ${destinationPath}`);
  const response = await fetch(downloadURL, {
    headers: {
      Accept: 'application/vnd.github.v3.raw',
      'User-Agent': 'Atom Build',
      Authorization: `token ${process.env.GITHUB_TOKEN}`
    }
  });

  if (response.status === 200) {
    fs.mkdirpSync(path.dirname(destinationPath));
    fs.writeFileSync(
      destinationPath,
      Buffer.from(await response.arrayBuffer())
    );
  } else {
    throw new Error(
      'Error downloading file. HTTP Status ' + response.status + '.'
    );
  }
};
