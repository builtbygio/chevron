/*
 * Task worker for project replace (files not open in a buffer).
 * JS RegExp semantics. Task shell stays until owned callers leave Task.
 */
const { replaceInFiles } = require('./replace-in-files');

module.exports = function(
  filePaths,
  regexSource,
  regexFlags,
  replacementText
) {
  const callback = this.async();
  const regex = new RegExp(regexSource, regexFlags);
  replaceInFiles(filePaths, regex, replacementText, (event, payload) => {
    emit(event, payload);
  });
  callback();
};
