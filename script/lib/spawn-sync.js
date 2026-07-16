// This file exports a function that has the same interface as
// `spawnSync`, but it throws if there's an error while executing
// the supplied command or if the exit code is not 0. This is similar to what
// `execSync` does, but we want to use `spawnSync` because it provides automatic
// escaping for the supplied arguments.

const childProcess = require('child_process');

module.exports = function() {
  // Capture argv before spawn so error messages work even when
  // result.args is missing (some Node/Electron spawnSync edge cases).
  const argv = Array.prototype.slice.call(arguments);
  const command =
    typeof argv[0] === 'string'
      ? [argv[0]].concat(Array.isArray(argv[1]) ? argv[1] : []).join(' ')
      : String(argv[0]);
  const result = childProcess.spawnSync.apply(childProcess, arguments);
  if (result.error) {
    throw result.error;
  } else if (result.status !== 0) {
    if (result.stdout) console.error(result.stdout.toString());
    if (result.stderr) console.error(result.stderr.toString());
    const cmd =
      result.args && result.args.length ? result.args.join(' ') : command;
    throw new Error(`Command ${cmd} exited with code "${result.status}"`);
  } else {
    return result;
  }
};
