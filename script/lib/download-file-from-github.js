'use strict';

const fs = require('fs-extra');
const path = require('path');

module.exports = async function(downloadURL, destinationPath) {
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
