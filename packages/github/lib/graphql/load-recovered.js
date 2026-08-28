'use strict';

const fs = require('fs');
const path = require('path');

const recoveredDir = path.join(__dirname, '..', '..', 'graphql', 'recovered');

function loadRecovered(name) {
  return fs.readFileSync(path.join(recoveredDir, name + '.graphql'), 'utf8');
}

module.exports = {loadRecovered};
