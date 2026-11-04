const { JUnitXmlReporter } = require('jasmine-reporters');

// jasmine-reporters 1 took positional arguments and hung the full suite name
// off spec.description in reportSpecResults. Version 2 takes an options object
// and records the full name itself.
function JasmineJUnitReporter(savePath, consolidate, useDotNotation, filePrefix, consolidateAll) {
  return new JUnitXmlReporter({
    savePath,
    consolidate,
    useDotNotation,
    filePrefix,
    consolidateAll,
    useFullTestName: true
  });
}

module.exports = { JasmineJUnitReporter };
