'use strict';

// Why a Jasmine run that exited 0 is still not a pass, or null if it is one.
//
// script/test trusted the exit code alone. A retried autocomplete-plus run
// exited 0 and the job went green, while the JUnit file listed nine failures
// that cannot pass (a spec activating a removed package among them).
function jasmineSummaryProblem(output) {
  const matches = [
    ...String(output).matchAll(/(\d+) tests?, \d+ assertions?, (\d+) failures?, (\d+) skipped/g)
  ];
  if (matches.length === 0) return 'it printed no Jasmine summary';
  const [, tests, failures, skipped] = matches[matches.length - 1];
  if (Number(failures) > 0) return `its summary reports ${failures} failures`;
  // All skipped is a real result: platform-tagged specs on another platform.
  if (Number(tests) === 0 && Number(skipped) === 0) return 'it ran no specs';
  return null;
}

module.exports = { jasmineSummaryProblem };
