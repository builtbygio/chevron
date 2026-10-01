const Mocha = require('mocha');
const fs = require('fs-plus');
const { assert } = require('chai');

module.exports = function(testPaths) {
  global.assert = assert;

  // These specs load renderer modules from source (AtomApplication's package
  // lookup reaches src/package-manager.js), and some are TypeScript. The app
  // never needs this: packaging compiles them, and the main process registers
  // no TypeScript loader by policy (script/ci/src-typescript-first.test.js).
  if (!require.extensions['.ts']) {
    const TypeScript = require('../../src/typescript');
    require.extensions['.ts'] = (module, filename) => {
      const source = fs.readFileSync(filename, 'utf8');
      module._compile(TypeScript.compile(source, filename), filename);
    };
  }

  let reporterOptions = {
    reporterEnabled: 'list'
  };

  if (process.env.TEST_JUNIT_XML_PATH) {
    reporterOptions = {
      reporterEnabled: 'list, mocha-junit-reporter',
      mochaJunitReporterReporterOptions: {
        mochaFile: process.env.TEST_JUNIT_XML_PATH
      }
    };
  }

  const mocha = new Mocha({
    reporter: 'mocha-multi-reporters',
    reporterOptions
  });

  for (let testPath of testPaths) {
    if (fs.isDirectorySync(testPath)) {
      for (let testFilePath of fs.listTreeSync(testPath)) {
        if (/\.test\.(coffee|js)$/.test(testFilePath)) {
          mocha.addFile(testFilePath);
        }
      }
    } else {
      mocha.addFile(testPath);
    }
  }

  mocha.run(failures => {
    if (failures === 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  });
};
