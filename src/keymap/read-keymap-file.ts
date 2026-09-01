'use strict';

/**
 * Read a keymap file, rejecting duplicate keys.
 *
 * season was called as CSON.readFileSync(path, {allowDuplicateKeys: false}),
 * and that option is not incidental: keymap files are hand-edited, and a
 * repeated selector or keystroke is a mistake the user wants told about.
 * JSON.parse keeps the last of a duplicate pair silently, so replacing season
 * with JSON.parse alone would turn a reported error into a binding that
 * quietly does not work.
 *
 * The scan below is not a parser. It walks the text tracking string state and
 * object depth, collecting the keys at each level, and reports a repeat. It
 * runs only after JSON.parse has already accepted the text, so it never has to
 * cope with malformed input -- which is what keeps it this short.
 */

const fs = require('fs');

function findDuplicateKey(text) {
  const stack = [];
  let inString = false;
  let escaped = false;
  let current = '';
  let expectingKey = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        if (expectingKey) {
          const seen = stack[stack.length - 1];
          if (seen) {
            if (seen.has(current)) return current;
            seen.add(current);
          }
          expectingKey = false;
        }
      } else current += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      current = '';
      // A string here is a key only if an object is open and we are at the
      // start of a member -- tracked by expectingKey, set on { and , below.
      continue;
    }
    if (ch === '{') {
      stack.push(new Set());
      expectingKey = true;
      continue;
    }
    if (ch === '}') {
      stack.pop();
      expectingKey = false;
      continue;
    }
    if (ch === '[') {
      // Array members are not keys; push a marker so } pairing stays right.
      stack.push(null);
      expectingKey = false;
      continue;
    }
    if (ch === ']') {
      stack.pop();
      expectingKey = false;
      continue;
    }
    if (ch === ',') {
      expectingKey = stack.length > 0 && stack[stack.length - 1] !== null;
      continue;
    }
    if (ch === ':') {
      expectingKey = false;
      continue;
    }
  }
  return null;
}

function readKeymapFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!text.trim()) return {};
  const data = JSON.parse(text);
  const duplicate = findDuplicateKey(text);
  if (duplicate != null) {
    const error = new Error(
      `Duplicate key "${duplicate}" in ${filePath}. The later one would ` +
        'silently win, so neither binding is loaded.'
    );
    error.path = filePath;
    throw error;
  }
  return data;
}

module.exports = { readKeymapFile, findDuplicateKey };
