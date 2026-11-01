'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');
const { createClipboardCompat } = require('../../src/main-process/clipboard-compat');

describe('clipboard compat', () => {
  it('returns the string just written before the promise settles', () => {
    let written = null;
    const clipboard = {
      writeText(text) {
        written = text;
        return Promise.resolve();
      },
      readText() {
        return Promise.resolve('from-os');
      }
    };
    const compat = createClipboardCompat(clipboard);
    compat.writeText('copied');
    assert.strictEqual(compat.readText(), 'copied');
    assert.strictEqual(written, 'copied');
  });

  it('uses clipboard.selection on Electron 44', async () => {
    let selection = '';
    const clipboard = {
      writeText() {
        return Promise.resolve();
      },
      readText() {
        return Promise.resolve('');
      },
      selection: {
        writeText(text) {
          selection = text;
          return Promise.resolve();
        },
        readText() {
          return Promise.resolve(selection);
        }
      }
    };
    const compat = createClipboardCompat(clipboard);
    compat.writeText('middle', 'selection');
    assert.strictEqual(compat.readText('selection'), 'middle');
    assert.strictEqual(selection, 'middle');
    await Promise.resolve();
    compat.refresh('selection');
    await Promise.resolve();
    assert.strictEqual(compat.readText('selection'), 'middle');
  });

  it('still accepts Electron 43 readText(type)', () => {
    const store = { clipboard: '', selection: '' };
    const clipboard = {
      writeText(text, type) {
        store[type === 'selection' ? 'selection' : 'clipboard'] = text;
      },
      readText(type) {
        return store[type === 'selection' ? 'selection' : 'clipboard'];
      }
    };
    const compat = createClipboardCompat(clipboard);
    compat.writeText('sel', 'selection');
    assert.strictEqual(compat.readText('selection'), 'sel');
  });
});
