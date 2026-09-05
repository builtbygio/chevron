'use strict';

/**
 * The parser reads its input in chunks, so the chunks have to reassemble into
 * exactly the buffer text.
 *
 * docs/reference/language-stack.md
 * Run: node --test script/ci/tree-sitter-chunk-reader.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SOURCE = path.join(ROOT, 'src', 'tree-sitter-language-mode.js');

// The real module needs Electron natives. The reader is a pure function of a
// buffer-shaped object, so it is lifted out and given one made of a string.
function loadChunkReader() {
  const source = fs.readFileSync(SOURCE, 'utf8');
  const start = source.indexOf('function chunkReaderForBuffer');
  assert.notEqual(start, -1, 'chunkReaderForBuffer must exist');
  let i = source.indexOf('{', start);
  let depth = 1;
  let j = i + 1;
  while (j < source.length && depth > 0) {
    if (source[j] === '{') depth++;
    else if (source[j] === '}') depth--;
    j++;
  }
  const body = source.slice(start, j);
  const Range = class {
    constructor(a, b) {
      this.start = a;
      this.end = b;
    }
  };
  const PARSE_CHUNK_SIZE = 4096;
  return new Function(
    'Range',
    'PARSE_CHUNK_SIZE',
    `${body}; return chunkReaderForBuffer;`
  )(Range, PARSE_CHUNK_SIZE);
}

const chunkReaderForBuffer = loadChunkReader();

// A buffer of the same shape as text-buffer's, over a plain string.
function bufferOf(text) {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') lineStarts.push(i + 1);
  }
  return {
    getMaxCharacterIndex: () => text.length,
    positionForCharacterIndex(index) {
      const clamped = Math.max(0, Math.min(index, text.length));
      let row = 0;
      while (row + 1 < lineStarts.length && lineStarts[row + 1] <= clamped) row++;
      return { row, column: clamped - lineStarts[row] };
    },
    getTextInRange(range) {
      const from = lineStarts[range.start.row] + range.start.column;
      const to = lineStarts[range.end.row] + range.end.column;
      return text.slice(from, to);
    }
  };
}

function readAll(text, chunkSize) {
  const read = chunkReaderForBuffer(bufferOf(text), chunkSize);
  let out = '';
  let index = 0;
  for (let guard = 0; guard < 100000; guard++) {
    const chunk = read(index);
    if (chunk === null) return out;
    assert.notEqual(chunk.length, 0, `empty chunk at ${index} of ${text.length}`);
    out += chunk;
    index += chunk.length;
  }
  throw new Error('reader did not terminate');
}

describe('reading a buffer in chunks', () => {
  const cases = [
    ['plain', 'const x = 1;\nconst y = 2;\n'],
    ['empty', ''],
    ['no trailing newline', 'let y = 2'],
    ['crlf', 'a = 1;\r\nb = 2;\r\nc = 3;\r\n'],
    ['mixed endings', 'a\r\nb\nc\r\nd'],
    ['astral characters', 'const s = "\u{1F600}\u{1F600}";\n'.repeat(40)],
    ['blank lines', '\n\n\n\n'],
    ['one long line', 'q'.repeat(20000)],
    ['many short lines', 'line\n'.repeat(5000)]
  ];

  for (const [name, text] of cases) {
    it(`reassembles exactly: ${name}`, () => {
      assert.equal(readAll(text, 4096), text);
    });
  }

  it('reassembles exactly at every chunk size', () => {
    // A surrogate pair or a line end landing on a boundary must not lose or
    // duplicate anything, whatever the size happens to be.
    const text = 'ab\u{1F600}cd\r\nef\n' + 'x'.repeat(300) + '\n\u{1F600}';
    for (let size = 1; size <= 40; size++) {
      assert.equal(readAll(text, size), text, `chunk size ${size}`);
    }
  });

  it('returns null past the end rather than an empty string', () => {
    const read = chunkReaderForBuffer(bufferOf('abc'), 4096);
    assert.equal(read(3), null);
    assert.equal(read(99), null);
    assert.equal(read(0), 'abc');
  });

  it('reads nothing at all from an empty buffer', () => {
    assert.equal(chunkReaderForBuffer(bufferOf(''), 4096)(0), null);
  });
});

describe('the parser is given the reader, not the whole text', () => {
  it('parse passes a callback', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const parseAt = source.indexOf('  parse(language, oldTree, ranges) {');
    assert.notEqual(parseAt, -1);
    const body = source.slice(parseAt, parseAt + 600);
    assert.match(body, /parser\.parse\(\s*chunkReaderForBuffer\(this\.buffer\)/);
    assert.doesNotMatch(
      body,
      /this\.buffer\.getText\(\)/,
      'handing the parser the whole buffer copies it on every keystroke'
    );
  });
});
