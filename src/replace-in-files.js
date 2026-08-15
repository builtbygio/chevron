'use strict';

/**
 * Project replace for files that are not open in a buffer.
 * JS RegExp semantics (same as TextBuffer.replace) — not `rg --replace`.
 */

const fs = require('fs');

function isLikelyBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function countMatches(text, regex) {
  const re = new RegExp(regex.source, regex.flags);
  if (re.global) {
    const matches = text.match(re);
    return matches ? matches.length : 0;
  }
  return re.test(text) ? 1 : 0;
}

function replaceInFile(filePath, regex, replacementText) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (error) {
    return {
      error: {
        code: error.code,
        path: filePath,
        message: error.message
      }
    };
  }

  if (isLikelyBinary(buf)) {
    return { skipped: true };
  }

  const text = buf.toString('utf8');
  const replacements = countMatches(text, regex);
  if (!replacements) {
    return { replacements: 0 };
  }

  const next = text.replace(regex, replacementText);
  try {
    fs.writeFileSync(filePath, next);
  } catch (error) {
    return {
      error: {
        code: error.code,
        path: filePath,
        message: error.message
      }
    };
  }

  return { filePath, replacements };
}

function replaceInFiles(filePaths, regex, replacementText, emit) {
  const paths = Array.isArray(filePaths) ? filePaths : [];
  for (const filePath of paths) {
    const result = replaceInFile(filePath, regex, replacementText);
    if (result.error) {
      emit('replace:file-error', result.error);
    } else if (result.replacements) {
      emit('replace:path-replaced', {
        filePath: result.filePath,
        replacements: result.replacements
      });
    }
  }
}

module.exports = {
  isLikelyBinary,
  countMatches,
  replaceInFile,
  replaceInFiles
};
