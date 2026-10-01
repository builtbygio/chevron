const fs = require('fs');
const path = require('path');
const { compileIndentPattern, fromOniguruma } = require('../src/auto-indent');

describe('auto-indent patterns', () => {
  describe('fromOniguruma', () => {
    it('drops whitespace and comments in extended mode', () => {
      expect(fromOniguruma('(?x) \\{ [^}]* $ # open brace\n | \\( $')).toBe(
        '\\{[^}]*$|\\($'
      );
    });

    it('limits a scoped (?x:...) group to that group', () => {
      expect(fromOniguruma('a b(?x: c d )e f')).toBe('a b(?:cd)e f');
    });

    it('keeps whitespace inside character classes and escaped', () => {
      expect(fromOniguruma('(?x) [ a] \\ b')).toBe('[ a]\\ b');
    });

    it('makes possessive quantifiers greedy', () => {
      expect(fromOniguruma('\\s*+end\\s++x?+')).toBe('\\s*end\\s+x?');
    });

    it('leaves an escaped plus after a quantifier alone', () => {
      expect(fromOniguruma('a*\\+')).toBe('a*\\+');
    });

    it('passes JavaScript-compatible syntax through', () => {
      const source = '^(?<!x)(?i:else)\\b[^\\]"]*$';
      expect(fromOniguruma(source)).toBe(source);
    });
  });

  it('compiles every indent pattern the bundled languages ship', () => {
    const keys = [
      'increaseIndentPattern',
      'decreaseIndentPattern',
      'decreaseNextIndentPattern',
      'indentNextLinePattern'
    ];
    const packagesDir = path.join(__dirname, '..', 'packages');
    const failures = [];
    let count = 0;
    for (const name of fs.readdirSync(packagesDir)) {
      const settingsDir = path.join(packagesDir, name, 'settings');
      if (!name.startsWith('language-') || !fs.existsSync(settingsDir)) continue;
      for (const file of fs.readdirSync(settingsDir)) {
        const settings = JSON.parse(
          fs.readFileSync(path.join(settingsDir, file), 'utf8')
        );
        for (const [selector, { editor = {} }] of Object.entries(settings)) {
          for (const key of keys) {
            if (editor[key] == null) continue;
            count++;
            if (!compileIndentPattern(editor[key])) {
              failures.push(`${name} ${selector} ${key}`);
            }
          }
        }
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
