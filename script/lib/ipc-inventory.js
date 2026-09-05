'use strict';

/**
 * Every IPC channel the main process registers.
 *
 * docs/process/ipc-surface-hardening.md
 */

const fs = require('fs');
const path = require('path');

const REGISTRATION = /\bipcMain\s*\.\s*(handle|on)\s*\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;

// Comments blanked, keeping length and newlines so offsets still give the
// right line number. A commented-out registration is not a registration.
function withoutComments(source) {
  const chars = source.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < chars.length; k++) {
      if (chars[k] !== '\n') chars[k] = ' ';
    }
  };
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (source[i] === '"' || source[i] === "'" || source[i] === '`') {
      const quote = source[i];
      let j = i + 1;
      while (j < source.length) {
        if (source[j] === '\\') j += 2;
        else if (source[j] === quote) { j++; break; }
        else j++;
      }
      i = j;
    } else {
      i++;
    }
  }
  return chars.join('');
}

function sourceFiles(rootDir) {
  const base = path.join(rootDir, 'src', 'main-process');
  const found = [];
  const walk = dir => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) found.push(full);
    }
  };
  walk(base);
  return found.sort();
}

function enumerateChannels(rootDir) {
  const found = [];
  for (const file of sourceFiles(rootDir)) {
    const source = fs.readFileSync(file, 'utf8');
    const code = withoutComments(source);
    REGISTRATION.lastIndex = 0;
    let match;
    while ((match = REGISTRATION.exec(code))) {
      found.push({
        channel: match[3],
        kind: match[1],
        file: path.relative(rootDir, file).split(path.sep).join('/'),
        line: code.slice(0, match.index).split('\n').length
      });
    }
  }
  return found.sort(
    (a, b) => a.channel.localeCompare(b.channel) || a.file.localeCompare(b.file)
  );
}

module.exports = { enumerateChannels, withoutComments };
