const path = require('path');
const temp = require('temp').track();
const CompileCache = require('../src/compile-cache');
const Babel = require('../src/babel');

describe('Babel transpile support (removed at runtime, issue #62)', function() {
  let originalCacheDir = null;

  beforeEach(function() {
    originalCacheDir = CompileCache.getCacheDirectory();
    CompileCache.setCacheDirectory(temp.mkdirSync('compile-cache'));
    for (let cacheKey of Object.keys(require.cache)) {
      if (cacheKey.startsWith(path.join(__dirname, 'fixtures', 'babel'))) {
        delete require.cache[cacheKey];
      }
    }
  });

  afterEach(function() {
    CompileCache.setCacheDirectory(originalCacheDir);
    try {
      temp.cleanupSync();
    } catch (error) {}
  });

  describe('when a .js file uses a legacy babel opt-in prefix', function() {
    it('detects prefixes via shouldCompile', function() {
      expect(Babel.shouldCompile('/** @babel */\nconst x = 1')).toBe(true);
      expect(Babel.shouldCompile("'use babel';\nconst x = 1")).toBe(true);
      expect(Babel.shouldCompile('"use babel";\nconst x = 1')).toBe(true);
      expect(Babel.shouldCompile('/* @flow */\nconst x = 1')).toBe(true);
      expect(Babel.shouldCompile('// @flow\nconst x = 1')).toBe(true);
      expect(Babel.shouldCompile('const x = 1')).toBe(false);
    });

    it('refuses to compile with a migration error', function() {
      expect(() =>
        Babel.compile('/** @babel */\nmodule.exports = 1', '/tmp/x.js')
      ).toThrow();
      try {
        Babel.compile('/** @babel */\nmodule.exports = 1', '/tmp/x.js');
      } catch (e) {
        expect(e.message).toContain('issue #62');
      }
    });

    it('does not load babel-prefix fixtures via require', function() {
      expect(() => require('./fixtures/babel/babel-comment.js')).toThrow();
      expect(() => require('./fixtures/babel/babel-single-quotes.js')).toThrow();
      expect(() => require('./fixtures/babel/babel-double-quotes.js')).toThrow();
    });
  });

  describe("when a .js file does not start with a babel opt-in", function() {
    it('does not try to transpile plain invalid ESM without prefix', function() {
      spyOn(console, 'error');
      expect(() => require('./fixtures/babel/invalid.js')).toThrow();
    });
  });
});
